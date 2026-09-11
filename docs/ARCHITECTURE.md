# Architecture

## Design goals

Inventory is structured around four constraints: it must be useful without infrastructure, preserve operational history, keep business rules independent from the DOM, and provide a clean path to authenticated multi-user synchronization.

## Layers

### Domain — `src/domain.mjs`

Owns the versioned state schema and all inventory invariants. UI code does not directly mutate checkout counts or archive state.

Current state shape:

```text
state
├── schemaVersion
├── settings.operator
├── items[]
│   ├── id
│   ├── name / sku / category / location / notes
│   ├── quantity
│   ├── checkedOut
│   ├── reorderPoint
│   ├── createdAt / updatedAt
│   └── archivedAt
└── transactions[]
    ├── id / itemId / itemName
    ├── type / quantity
    ├── actor / counterparty
    ├── dueDate / note
    └── at
```

Every supported state transition returns a new top-level state and records an audit transaction.

### Persistence — `src/storage.mjs`

The persistence adapter stores one versioned state snapshot in IndexedDB and falls back to localStorage only when IndexedDB is unavailable. No domain function knows which storage implementation is used.

A future server adapter should preserve this boundary rather than allowing components to call a database SDK directly.

### UI — `src/app.mjs`

The UI coordinates forms, filtering, rendering, backup/restore, and the persistence adapter. User data is assigned through `textContent` and DOM attributes; it is not interpolated into HTML strings.

### Delivery — static PWA

The app requires no build step. `index.html`, `styles.css`, ES modules, the manifest, and service worker can be served directly by GitHub Pages or any static host.

## Domain invariants

The domain layer currently enforces:

1. Quantities and thresholds are nonnegative whole numbers.
2. Total quantity cannot be reduced below currently checked-out units.
3. Checkout quantity cannot exceed available units.
4. Return quantity cannot exceed checked-out units.
5. Archived records cannot be checked out.
6. Records with outstanding checkouts cannot be archived.
7. Backup imports must match the supported schema and contain unique item IDs.

These constraints are covered by `test/domain.test.mjs`.

## Local-first limitations

The local-first implementation deliberately does not claim multi-user consistency. Two browsers have independent datasets, the operator label is not authenticated, and local activity records are not tamper-proof.

This mode is appropriate for evaluation, personal inventory, disconnected operation, and as the front-end foundation for the next phase.

## Multi-user synchronization phase

The recommended evolution is an authenticated API behind the persistence boundary. Requirements should include:

- server-issued authenticated identities;
- role-based authorization enforced server-side;
- transactional checkout/return operations to prevent oversubscription;
- optimistic concurrency or revision tokens;
- append-only immutable audit events;
- durable database backups and restore drills;
- explicit organization / tenant isolation if the app becomes multi-tenant;
- migration from local JSON backups;
- offline mutation queue with conflict resolution if offline writes remain a requirement.

The server should accept domain commands such as checkout or return rather than arbitrary client-authored database documents.

## Why there is no framework dependency

The application surface is small enough that a framework would not currently reduce complexity. Removing the abandoned Webpack 3 / Node Sass / MongoDB Stitch stack eliminates the majority of the original supply-chain and maintenance burden. A framework can be introduced later if application complexity justifies it, but the domain and persistence boundaries should remain framework-independent.
