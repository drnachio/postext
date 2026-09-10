#!/usr/bin/env node
// Counts the lines of source code in the project, grouped by extension.
//
//   node scripts/line-count.mjs [--no-deps] [--no-docs] [--json] [--by-package] [path ...]
//
//   --no-deps     skip the installed packages under node_modules
//   --no-docs     skip docs (.md, .mdx, .txt)
//   --json        machine-readable output
//   --by-package  group by package instead of by extension
//   path ...      limit the first-party count to these paths
//
// First-party files come from git (tracked + untracked, honouring .gitignore),
// so build output and other ignored paths never reach the count. Installed
// packages are walked straight from node_modules and counted in the same
// table; under pnpm the real files live in the .pnpm store, so every installed
// version is counted exactly once.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.less', '.html', '.svg', '.vue',
  '.json', '.jsonc', '.json5', '.yml', '.yaml', '.toml',
  '.sh', '.bash', '.zsh', '.py', '.rs', '.go', '.sql', '.graphql',
])

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt'])

// Extensions that report under a different label than their own.
const LABELS = new Map([
  ['.mjs', '.rs'],
])

// Generated or vendored files: not code anybody wrote.
const EXCLUDED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)skills-lock\.json$/,
  /\.min\.(js|css)$/,
  /\.map$/,
]

const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const paths = args.filter((arg) => !arg.startsWith('--'))

const includeDeps = !flags.has('--no-deps')
const includeDocs = !flags.has('--no-docs')
const asJson = flags.has('--json')
const byPackage = flags.has('--by-package')

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

const firstPartyFiles = () =>
  execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...(paths.length ? paths : ['.'])],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean)

// Every node_modules tree in the workspace. Symlinks are never followed, so
// pnpm's links resolve to a single copy in node_modules/.pnpm.
const dependencyRoots = () =>
  ['.', ...readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (entry.name === 'apps' || entry.name === 'packages'))
    .flatMap((entry) =>
      readdirSync(join(root, entry.name), { withFileTypes: true })
        .filter((child) => child.isDirectory())
        .map((child) => `${entry.name}/${child.name}`),
    )]
    .map((dir) => join(dir, 'node_modules'))
    .filter((dir) => {
      try {
        return statSync(join(root, dir)).isDirectory()
      } catch {
        return false
      }
    })

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === '.bin' || entry.isSymbolicLink()) continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.isFile()) yield path
  }
}

const kindOf = (file) => {
  const ext = extname(file).toLowerCase()
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (DOC_EXTENSIONS.has(ext)) return 'docs'
  return null
}

// Workspace packages live under apps/* and packages/*; everything else is root.
const workspaceOf = (file) => {
  const [dir, name] = file.split('/')
  return (dir === 'apps' || dir === 'packages') && name ? `${dir}/${name}` : '(root)'
}

// ".../node_modules/foo/lib/x.js" -> "foo"; scoped names keep both segments.
const dependencyOf = (file) => {
  const segments = file.split('/')
  const last = segments.lastIndexOf('node_modules')
  if (last === -1 || !segments[last + 1]) return '(unknown)'
  const name = segments[last + 1]
  return name.startsWith('@') && segments[last + 2] ? `${name}/${segments[last + 2]}` : name
}

const groupOf = (file) => {
  if (!byPackage) {
    const ext = extname(file).toLowerCase()
    return LABELS.get(ext) ?? ext
  }
  return file.includes('node_modules/') ? dependencyOf(file) : workspaceOf(file)
}

const countLines = (absolute) => {
  const text = readFileSync(absolute, 'utf8')
  if (text === '') return { total: 0, blank: 0 }
  const lines = text.split('\n')
  // A trailing newline closes the last line rather than starting a new one.
  if (lines.at(-1) === '') lines.pop()
  return { total: lines.length, blank: lines.filter((line) => line.trim() === '').length }
}

const emptyTally = () => ({ files: 0, lines: 0, blank: 0 })

const files = [
  ...firstPartyFiles(),
  ...(includeDeps ? dependencyRoots().flatMap((dir) => [...walk(dir)]) : []),
]

const buckets = new Map()
const totals = emptyTally()

for (const file of files) {
  const kind = kindOf(file)
  if (!kind) continue
  if (kind === 'docs' && !includeDocs) continue
  if (EXCLUDED.some((pattern) => pattern.test(file))) continue

  let counts
  try {
    counts = countLines(resolve(root, file))
  } catch {
    continue // gone from disk, or not valid text
  }

  const key = groupOf(file)
  const bucket = buckets.get(key) ?? { key, ...emptyTally() }
  bucket.files += 1
  bucket.lines += counts.total
  bucket.blank += counts.blank
  buckets.set(key, bucket)

  totals.files += 1
  totals.lines += counts.total
  totals.blank += counts.blank
}

const rows = [...buckets.values()].sort((a, b) => b.lines - a.lines)

if (asJson) {
  console.log(JSON.stringify({ root: relative(process.cwd(), root) || '.', groups: rows, total: totals }, null, 2))
  process.exit(0)
}

const number = (value) => value.toLocaleString('en-US')
const columns = [
  { header: byPackage ? 'package' : 'ext', value: (row) => row.key, align: 'left' },
  { header: 'files', value: (row) => number(row.files) },
  { header: 'lines', value: (row) => number(row.lines) },
  { header: 'blank', value: (row) => number(row.blank) },
  { header: 'code', value: (row) => number(row.lines - row.blank) },
]

// Long package lists are noise; the tail is summarised in one row.
const TOP_ROWS = 25
const body =
  rows.length <= TOP_ROWS
    ? rows
    : [
        ...rows.slice(0, TOP_ROWS),
        rows.slice(TOP_ROWS).reduce(
          (acc, row) => ({ ...acc, files: acc.files + row.files, lines: acc.lines + row.lines, blank: acc.blank + row.blank }),
          { key: `… ${rows.length - TOP_ROWS} more`, ...emptyTally() },
        ),
      ]

const footer = { key: 'TOTAL', ...totals }
const widths = columns.map((column) =>
  Math.max(column.header.length, ...[...body, footer].map((row) => column.value(row).length)),
)
const pad = (cell, index) =>
  columns[index].align === 'left' ? cell.padEnd(widths[index]) : cell.padStart(widths[index])
const line = (row) => columns.map((column, index) => pad(column.value(row), index)).join('  ')
const rule = widths.map((width) => '-'.repeat(width)).join('  ')

console.log(columns.map((column, index) => pad(column.header, index)).join('  '))
console.log(rule)
for (const row of body) console.log(line(row))
console.log(rule)
console.log(line(footer))
