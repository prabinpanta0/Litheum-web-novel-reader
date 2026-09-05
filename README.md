# Litheum — Web Novel Reader

A quiet, literary web reader for web novels and light novels, built on the
[LNReader plugin system](https://github.com/lnreader/lnreader-plugins). Local-first:
reading and your library work entirely in the browser with no account.

## Getting started

```sh
npm install
npm run dev        # dev server (http://localhost:5173)
npm run build      # production build
npm test           # unit tests (vitest)
```

Vite's dev server ships a same-origin content proxy (`/https:<url>`) so plugins
can fetch novel sites that don't send CORS headers. Set
`setNetwork({ mode: 'proxy' })` — this is done in `App.tsx` on mount.

## Architecture

- **`src/plugins/`** — loads and sandboxes CJS plugins (require `@libs/fetch`,
  `cheerio`, `dayjs`, …), with a registry, repo sync, and a proxy fetcher.
- **`src/store/`** — local persistence. Backends are pluggable: browser
  (IndexedDB) or device files (OPFS), selected in Settings.
- **`src/pages/`** — Library, Search, Sources, Reader, Settings.
- **`vite/proxy.ts`** — the dev content proxy.
- **`src/sync/` + Neon** — optional cloud sync (see below).

## Cloud sync (optional)

Cloud sync is **opt-in** — it never runs unless you sign in, and is never required
to read. It stores your library/history/bookmarks through **Neon Functions + Auth**.
Once signed in, changes are pushed automatically and a snapshot is pulled on launch.

Deploying the backend requires the Neon CLI and your browser (for `neon login`):

```sh
npm i -g neon@latest && neon login   # opens your browser to authorize
neon skills -y && neon config init
neon link --project-id royal-bird-90217763 --branch production -y
bash scripts/neon-setup.sh           # deploys hello.ts + applies migrations
```

The script applies `migrations/001_init.sql` (`users`, `litheum_state` tables) and
is idempotent. Set a strong `AUTH_SECRET` for the function (it defaults to the
insecure `change-me-in-neon`). The client targets the deployed function by default
(`src/sync/client.ts`); override with `VITE_SYNC_API` in `.env` if needed.
