This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Private presets (local only)

The sandbox can load private "preset bundles" (publisher configuration, fonts, logos) from a directory that lives **outside this repository**. Point the `POSTEXT_PRIVATE_PRESETS_DIR` environment variable at that directory (see `.env.example`) and run `pnpm dev`; its files are then served at `/api/private-presets/<relative-path>` and the sandbox picks them up automatically.

- Only files with allow-listed extensions (`json`, `md`, `svg`, `png`, `jpg`, `jpeg`, `webp`, `gif`, `otf`, `ttf`, `woff2`) are served; path traversal, dotfiles and symlinks that escape the directory are refused.
- The variable is read at request time and is only declared for the `dev` task in `turbo.json`. In production it is never set, so the route answers `404` for every path and the sandbox is configured with an empty preset-source list.
- Nothing under that directory belongs in git. Keep it outside the repo and never commit `.env` files (only `.env.example` is tracked).
