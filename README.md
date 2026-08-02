# MatterMail Review

Windows-first desktop app for reviewing Gmail and assigning messages to Clio Manage matters.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Windows for `pnpm dist:win` installer (dev works cross-platform)

## Commands

```bash
pnpm install
pnpm dev
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm safety-check
pnpm build
pnpm dist:win
```

## Demo mode

Without credentials the app runs in clearly labeled **Demo / Mock mode** with fictional fixtures (Jonathan Roberts / Roberson, Quest JV examples, RetailMart newsletter).

## Safety

- Gmail: readonly scope only
- Clio: no DELETE/PATCH; staged creates only
- Drive: no delete/overwrite
- Quest: no authentication
- AI: BYO keys; exact model transparency; no silent fallback

See `docs/` and `IMPLEMENTATION_STATUS.md`.
