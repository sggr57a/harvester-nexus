# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Nexus is a React + TypeScript SPA (Vite) that serves as a front-end demo for a hyperconverged infrastructure (HCI) management platform. There is **no backend** — all data is mock/computed locally. Authentication uses hardcoded credentials: `admin` / `demo`.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (serves on port **4173**) |
| Type check | `npx tsc --noEmit` |
| Unit tests | `npm run test` (Vitest, 41 tests) |
| Production build | `npm run build` |

### Key notes

- The Vite dev server is configured to port **4173** (not the default 5173); see `vite.config.ts`.
- All dashboard styling lives in a single file: `src/styles.css`. Theme tokens use CSS custom properties (`--theme-*` and `--route-*`).
- Three themes are available (Route Grid, Emerald Console, Solar Flare) — switchable via the sidebar theme picker; persisted in `localStorage` as `nexus.theme`.
- The `platform/harvester/` directory contains Go source from the upstream Harvester project. It is **not built or run** as part of the frontend demo. Ignore it for frontend development.
- No ESLint/Prettier is configured; the only lint gate is `tsc --noEmit`.
- Playwright scripts under `scripts/` (smoke-shot, record-mockups) are optional and require `npx playwright install chromium` before first use.
- **ISO builds on `main`:** every push to `main` runs `.github/workflows/build-iso.yml` and publishes a pre-release ISO under GitHub Releases (`iso-main-<run>`). See `installer/README.md` for download instructions.
