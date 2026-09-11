# Security policy

## Supported version

Security fixes target the current `master` branch.

## Current trust boundary

Inventory is currently a local-first application. Records are stored in the browser using IndexedDB, with localStorage only as a fallback. No runtime credentials, API tokens, or database secrets are required.

The local **Operator** value is an audit label only. It is not authentication, cannot prove identity, and must never be used as an authorization boundary.

## Security properties

- No third-party runtime dependencies.
- No external network requests from the application.
- Restrictive self-only Content Security Policy in the HTML document.
- User-entered values are rendered with DOM text nodes instead of HTML interpolation.
- JSON backup imports are schema-validated and size-limited before replacing state.
- CSV export mitigates spreadsheet formula injection for cells beginning with `=`, `+`, `-`, or `@`.
- Inventory state transitions reject invalid checkout, return, stock-reduction, and archive operations.
- Archive is preferred to destructive deletion so operational history is retained.

## Deployment guidance

For deployments outside GitHub Pages, enforce security headers at the HTTP layer in addition to the HTML CSP, including an appropriate `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and clickjacking protection using CSP `frame-ancestors`.

For shared multi-user operation, do not add direct browser credentials to a database. Introduce a server-side synchronization API that provides authenticated identity, server-enforced authorization, validation of every state transition, conflict handling, rate limits, durable backups, and append-only audit records.

## Reporting a vulnerability

Please report security-sensitive findings privately to the repository owner rather than opening a public issue containing exploit details or credentials.
