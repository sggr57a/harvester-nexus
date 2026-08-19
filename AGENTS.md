# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Nexus is a React + TypeScript SPA (Vite) for a hyperconverged infrastructure (HCI) management platform.

It runs in one of two modes, resolved by `src/lib/telemetry/mode.ts`:

- **live** — the SPA is served by the cockpit BFF on an installed node
  (`installer/overlay/usr/lib/nexus/serve-cockpit.py`), which collects real
  cluster and host metrics by shelling out to `kubectl` and reading kernel
  counters. There *is* a backend; it just isn't part of the Vite dev server.
- **demo** — no backend reachable, so dashboards render synthetic data. This is
  the mode you get from `npm run dev`.

Metrics the node cannot measure are returned as `null`, never as `0` or a
placeholder, and are listed in `snapshot.unavailableMetrics` so the UI can show
"unavailable" instead of a fabricated reading. Preserve that distinction when
adding widgets.

Authentication on an installed node is server-side (PBKDF2 + bearer sessions in
`cockpit_auth.py`); the initial admin password is generated at first boot and
written to `/etc/nexus/cockpit-password`. There is no hardcoded default. The
standalone demo still accepts `admin` / `admin` locally via `src/lib/auth.ts`
because it has no backend to authenticate against.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (serves on port **4173**) |
| Type check | `npx tsc --noEmit` |
| Unit tests | `npm run test` (Vitest) |
| Production build | `npm run build` |

### Key notes

- The Vite dev server is configured to port **4173** (not the default 5173); see `vite.config.ts`.
- All dashboard styling lives in a single file: `src/styles.css`. Theme tokens use CSS custom properties (`--theme-*` and `--route-*`).
- Four themes are available (Route Grid, Arctic Hologram, Arctic Command, Ice Spectrum) — switchable via the sidebar theme picker; persisted in `localStorage` as `nexus.theme`.
- The `platform/harvester/` directory contains Go source from the upstream Harvester project. It is **not built or run** as part of the frontend demo. Ignore it for frontend development.
- No ESLint/Prettier is configured; the only lint gate is `tsc --noEmit`.
- Playwright scripts under `scripts/` (smoke-shot, record-mockups) are optional and require `npx playwright install chromium` before first use.
- **ISO builds on `main`:** every push to `main` runs `.github/workflows/build-iso.yml` and publishes a pre-release ISO under GitHub Releases (`iso-main-<run>`). See `installer/README.md` for download instructions.
- Live XDR events come from Falco / Tetragon / Suricata / Wazuh pod logs via `xdr_ingest.py`; Kubernetes Warning events keep a derived severity instead of a hardcoded `medium`.
- Live consoles attach through `console_proxy.py` (`/api/v1/console/{vnc,serial,exec}`) onto KubeVirt subresources or `kubectl exec`. `src/lib/demoConsole.ts` is demo-mode only.
- Memory tiering is host-side (`memory_tiering.py` + `nexus-memory-tiering.service`). Live Processor & Memory reads `/proc` and `/sys` (demotion, zswap, swap, PSI, NUMA). Do not fabricate tier capacity when the hardware is absent — list it under `waitingForHardware`.
