# Inventory

A small, local-first inventory management application for tracking shared equipment, rooms, vehicles, loaners, and other operational resources.

The original 2018 prototype has been replaced with a dependency-free progressive web app. The current application is designed to be useful immediately in a single browser while keeping the persistence layer isolated for a future authenticated synchronization service.

## What it does

- Create and edit inventory records with SKU / asset tag, category, location, quantity, low-stock threshold, and notes.
- Check units out to a borrower or destination with optional due date and note.
- Return checked-out units with quantity validation.
- Prevent checkout beyond available stock, returns beyond outstanding stock, quantity reductions below checked-out stock, and archiving while units remain checked out.
- Search and filter by category, location, and operational status.
- Show active items, total units, checked-out units, and low-availability counts.
- Preserve an activity trail for create, edit, checkout, return, archive, and restore operations.
- Export a complete versioned JSON backup and restore only after validation.
- Export CSV with spreadsheet-formula injection protection.
- Work offline after first load and install as a PWA.
- Render user-entered data through DOM text nodes rather than HTML injection.

## Run locally

No package installation or build step is required. Serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Do not open `index.html` directly from `file://`; IndexedDB, ES modules, and service workers are intended to run from an HTTP(S) origin.

## Verify

Node 22 or newer is used only for repository verification:

```bash
npm run verify
```

The command runs JavaScript syntax checks and the domain test suite without installing dependencies.

## Persistence and trust boundary

Inventory data is stored locally in IndexedDB with a localStorage fallback. The **Operator** field is only an audit label. It is not authentication and must not be treated as authorization.

For a shared organizational deployment, add an authenticated server-side persistence adapter with authorization enforced on the server. Do not restore the previous browser-to-database trust model. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`SECURITY.md`](SECURITY.md).

## Backups

Use **Data → Export JSON backup** before browser resets, migrations, or risky changes. Imports are schema-validated and limited in size before replacing local state. CSV is intended for reporting or migration, not round-trip restoration.

## Deployment

`.github/workflows/pages.yml` deploys the static application to GitHub Pages from `master`. The repository contains no runtime secrets and the app makes no external network requests.

## Architecture

The application is deliberately small:

- `index.html` — semantic application shell and dialogs
- `styles.css` — responsive design system with light/dark support
- `src/domain.mjs` — inventory rules and state transitions
- `src/storage.mjs` — persistence adapter
- `src/app.mjs` — UI orchestration and safe rendering
- `sw.js` / `manifest.webmanifest` — offline and installability
- `test/domain.test.mjs` — domain invariants

## Next production phase

The highest-value next phase is authenticated multi-user synchronization. Recommended requirements are server-enforced identity and roles, conflict-aware writes, append-only audit events, migration tooling, backup/restore procedures, and deployment headers such as CSP and frame restrictions at the HTTP layer.

## License

See [`LICENSE`](LICENSE).
