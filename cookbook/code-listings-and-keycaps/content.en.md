---
title: "The Shell, Gently"
subtitle: "A pocket guide to the command line"
author: "Tove Ahlberg"
---

# Small tools, joined {kicker="Chapter 4" lead="How the pipe character chains programs that each do one job to answer a question about a folder."}

Each program in this chapter does one job. `ls` lists the names in a folder, `grep` keeps the lines that match a pattern, `sort` puts lines in order and `du` reports how much disk space a file takes. The pipe, the `|` character, sends whatever one program prints into the next one, so you can chain them on a single line and read the answer at the end.

:::callout{type="aside" title="The prompt"}
On a Mac, zsh prints `%` instead of `$`.
:::

Try it in a folder of photographs. In the listings, a line that starts with a dollar sign is one you type, leaving out the dollar, and run with :chip[Enter]{style="key"}. The dollar is the prompt, which the shell prints to show it is waiting for you. The lines under it are the shell’s answer.

```console Terminal
$ cd ~/Pictures/2025
$ ls | grep -c 'JPG$'
268
$ ls | grep -v 'JPG$'
IMG_0413.MOV
IMG_0977.MOV
IMG_1502.PNG
$ du -sh *.MOV | sort -rh
812M    IMG_0977.MOV
455M    IMG_0413.MOV
```

:::paragraphs{style="resume"}
`grep -c` counts the matching lines instead of printing them, and `-v` keeps the lines that do not match. The single quotes hand the pattern to `grep` as typed; in it, `$` marks the end of the line. The star in the last command belongs to the shell: before `du` starts, `*.MOV` is already the list of names ending in `.MOV`.
:::

:::callout{type="aside" title="On a Mac"}
:chip[Ctrl]{style="key"} is :chip[control]{style="key"}

:chip[Enter]{style="key"} is :chip[return]{style="key"}

Shortcuts use :chip[control]{style="key"}, not :chip[command]{style="key"}.
:::

## When a command will not stop

Sooner or later you will start a command that does not finish. Type `grep JPG` with no file after it, and `grep` sits waiting for you to type the lines it should search. To stop it, hold :chip[Ctrl]{style="key"} and press :chip[C]{style="key"}; the prompt comes back and nothing has changed. To end its input properly instead, press :chip[Ctrl]{style="key"} :chip[D]{style="key"} at the start of an empty line; `grep` reads it as the end of its input. :chip[Ctrl]{style="key"} :chip[C]{style="key"} also stops a `ping`, which would otherwise print a line every second until you close the window.

The shell also saves you typing. After the first letters of a file or folder name, press :chip[Tab]{style="key"} and the shell fills in the rest; when more than one name fits, it lists them (bash waits for a second :chip[Tab]{style="key"}). :chip[↑]{style="key"} brings back the last command, and each press goes one further back, so a pipeline with a typo can be mended instead of typed again.

1. Type `cd ~/Pic` and press :chip[Tab]{style="key"} to complete the folder name, `Pictures/`, then add `2025` and press :chip[Enter]{style="key"}.
2. Press :chip[↑]{style="key"} until `ls | grep -v 'JPG$'` is back on the line.
3. Hold :chip[Ctrl]{style="key"} and press :chip[A]{style="key"} to jump to the start of the line, then :chip[Ctrl]{style="key"} :chip[E]{style="key"} to return to the end.
4. Type `| sort -r` and press :chip[Enter]{style="key"}. The same names come back in reverse order.

:::callout{type="sheet" title="Cheat sheet · bash and zsh"}
:::columns{count=2 breaks="8"}
**On the line**

:chip[Ctrl]{style="key"} :chip[A]{style="key"} start of the line

:chip[Ctrl]{style="key"} :chip[E]{style="key"} end of the line

:chip[Ctrl]{style="key"} :chip[W]{style="key"} cut the word to the left

:chip[Ctrl]{style="key"} :chip[K]{style="key"} cut to the end of the line

:chip[Ctrl]{style="key"} :chip[Y]{style="key"} paste what you cut

:chip[Ctrl]{style="key"} :chip[T]{style="key"} swap two letters

**Commands and history**

:chip[Ctrl]{style="key"} :chip[R]{style="key"} search earlier commands

:chip[Ctrl]{style="key"} :chip[P]{style="key"} the previous command

:chip[Ctrl]{style="key"} :chip[C]{style="key"} stop the running command

:chip[Ctrl]{style="key"} :chip[Z]{style="key"} pause it; `fg` resumes it

:chip[Ctrl]{style="key"} :chip[L]{style="key"} clear the screen

:chip[Ctrl]{style="key"} :chip[D]{style="key"} close the shell (empty line)
:::
:::

## A script to keep

Commands you type every week are worth keeping in a file. The one below copies each folder in Documents to an external disk, into a new folder named after the day’s date. Save it as `backup.sh` in your home folder.

```bash backup.sh
#!/usr/bin/env bash
# Copy each folder in ~/Documents to a dated folder on the backup disk.
set -euo pipefail

src="$HOME/Documents"
dest="/Volumes/Backup/$(date +%F)"

mkdir -p "$dest"
for dir in "$src"/*/; do
  name=$(basename "$dir")
  rsync -a "$dir" "$dest/$name/"
  echo "copied $name"
done
```

:::callout{type="aside" title="Archive mode"}
`rsync -a` copies the subfolders too and keeps each file’s dates and permissions.
:::

:::paragraphs{style="resume"}
The first line, the *shebang*, names the program that runs the file. `set -euo pipefail` stops the script at the first command that fails, so it never carries on with half a backup. `$(date +%F)` runs `date` and puts what it prints, such as 2026-09-26, into the path. The quotes round each variable keep a folder called My Taxes in one piece; without them the shell would split the name at the space and `rsync` would look for two folders that do not exist.
:::

Run `chmod +x backup.sh` once to make the file executable, then start it with `./backup.sh`. On Linux an external disk usually appears under `/media`, in a folder named after your user, so change the `dest` line to match.

:::callout{type="colophon"}
*The Shell, Gently* is a fictional book written for the Postext Cookbook. Set in Charis SIL, Sora and JetBrains Mono (SIL OFL). Text: original, CC BY 4.0.
:::

Chapter 5 points `grep` at the log files under `/var/log`, where a pipeline of three commands counts how many errors the system logged on each day of the past week.
