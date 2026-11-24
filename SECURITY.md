# Security Policy

> Draft — owner decisions incorporated 24.11.2026. Formal adoption (copy into the repository, owner approval of this revision) is still pending; nothing here is owner-approved policy until adopted.

## System and Scope

Single-user, local prompt manager for categories, tags, Markdown display, and import/export, shipped as a self-contained HTML file plus an optional local backup server. It is described as browser-local in `README.md:5`, with the client logic in the inline script at `prompt-manager.html:1558`.

In scope for this component (`scope="."`):

- `prompt-manager.html` — UI and all client logic.
- `serve.mjs` — optional Node backup server and static delivery; defaults include port `8765` and host `[IP_ADDRESS]` in `serve.mjs:297`, data file beside the app in `serve.mjs:114`, and a per-process random token in `serve.mjs:115`.
- `scripts/install-autostart.mjs` — Windows autostart/Desktop launcher, built at `scripts/install-autostart.mjs:85`, with a Windows-only path at `scripts/install-autostart.mjs:107` and a non-Windows no-op at `scripts/install-autostart.mjs:151`.
- `scripts/check.mjs`, `tests/`, and `.github/workflows/ci.yml:1` — CI/quality tooling, not production runtime.

Modes: standalone browser use from disk, where state uses `localStorage` keys `promptCategories_v2` / `prompts_v2` (`prompt-manager.html:1578`, read at `prompt-manager.html:1913`, written at `prompt-manager.html:1945`); and server mode via `node serve.mjs`, where the page calls `/api/state` (`prompt-manager.html:1642`). No accounts, credentials, or third-party data stores were found in the inspected source.

Assets: the user's prompt library and its backups — browser storage, the server data file and its `.bak` copy (`serve.mjs:255`), export/backup downloads, and the per-process server token injected into served HTML (`serve.mjs:181`).

Deployment (owner-confirmed 24.11.2026): strictly single-user on one trusted machine, default loopback bind only. Network (LAN/WAN) or shared use is not supported. Source code being public on GitHub does not change this model: user data files are git-ignored and never part of the repository.

## Threat Model and Trust Boundaries

- **Trusted actor (owner-confirmed 24.11.2026):** the single local user and operator on a trusted personal machine. This is the only supported deployment; there is no multi-user control and none is claimed.
- **Untrusted input:** imported JSON and pasted chat history, validated by `validateImportedData` (`prompt-manager.html:2511`) with a version allow-list (`prompt-manager.html:2532`) and count caps (`prompt-manager.html:2545`), then normalized by `normalizeState` (`prompt-manager.html:1811`) and merged, not overwritten (`prompt-manager.html:2598`). Direct `/api/state` callers are not a supported input class (owner default 24.11.2026: the page is the only intended caller; shallow server-side validation beyond shape and counts at `serve.mjs:86`, `serve.mjs:89`, `serve.mjs:93` is accepted by design).
- **Network boundary:** the server defaults to loopback (`serve.mjs:116`), rejects non-loopback `Host` headers (`serve.mjs:136`), and rejects state-changing requests with a foreign `Origin` (`serve.mjs:144`). A non-loopback `--host` only warns (`serve.mjs:471`) and no TLS or user authentication is provided.
- **Rendering boundary:** Markdown output escapes HTML first via `escapeHtml` (`prompt-manager.html:1672`) and restricts link/image targets via `sanitizeUrl` (`prompt-manager.html:1680`); the page CSP forbids network egress and framing (`prompt-manager.html:12`).
- **Operator obligations (owner-confirmed 24.11.2026):** use at the operator's own risk; the owner takes no responsibility for the loss of stored secrets or personal data; do not store secrets, health data, or account numbers; protect data files and backups as user data in the OS/browser profile; do not treat the page-embedded token as user authentication; do not expose the server on a LAN or shared host. Other users are responsible for protecting their own data files and backups.

## Security Invariants

- Only `prompt-manager.html` and `/api/state` (+ tokenless `/api/health` at `serve.mjs:157`) are served; other paths return 404 and no arbitrary files are served (`serve.mjs:267`).
- `/api/state` requires the per-process token, checked at `serve.mjs:198`; responses carry `no-store`, `nosniff`, and same-origin CORP headers (`serve.mjs:47`).
- Imported/pasted content is size- and count-bounded and normalized before storage or rendering (`prompt-manager.html:2511`, `prompt-manager.html:1811`), and stored content is re-normalized on load (`prompt-manager.html:1929`). Client import cap is 25 MiB (`prompt-manager.html:1598`); server body cap is 30 MiB (`serve.mjs:39`), with 10,000 prompts / 500 categories (`serve.mjs:40`).
- Data-file writes are atomic via temp file and rename, retaining a `.bak` copy (`serve.mjs:252`, `serve.mjs:257`).
- Renderer safety: HTML escaping and URL sanitization (`prompt-manager.html:1672`, `prompt-manager.html:1680`) must hold; regressions are pinned by `tests/security.test.mjs:7`.
- Generated user-data artifacts and local-only docs remain git-ignored and must not be committed (`prompt-manager-data.json` at `.gitignore:5`, backups at `.gitignore:4`, logs at `.gitignore:16`).

## Reportable Findings and Severity Context

> Draft proposal — requires owner review; not owner-confirmed severity policy.

- Reportable: a broken control above with realistic reachability in the supported local deployment, e.g. token/`Host`/`Origin` bypass, arbitrary file serving, stored XSS via the rendering pipeline, import validation bypass reaching storage, or unbounded resource use beyond the stated caps.
- Severity context (owner statement 24.11.2026): the highest-value asset is the prompt library itself (confidentiality and integrity of user content and backups). The owner currently stores no secrets in it; if secrets or third-party personal data are stored, the asset's value and handling requirements change. Reachability is loopback-only by default with a token gate, but the token is page-embedded, there is no user authentication, and `--host` can widen exposure with only a warning (`serve.mjs:471`).
- Not reportable without owner confirmation: issues confined to generated user-data contents, local-only docs, or quality-tooling failures that do not mask a product control.

## Out of Scope, Exclusions, and Accepted Risk

Owner-confirmed 24.11.2026: generated user-data artifacts (`prompt-manager-data.json`, `.bak`, backup JSONs, logs, all git-ignored per `.gitignore:4`, `.gitignore:5`, `.gitignore:16`) and local-only docs (`CHANGELOG.md`, `PLANUNG.md`, `.full-review/` per `.gitignore:19`) are out of scope for source scanning. The standing obligation remains: they must not be committed.

Accepted risks (owner-confirmed 24.11.2026):

- Single-user loopback only: no multi-user authentication, no TLS, the token is handed to the page itself, and a non-loopback bind is warning-only. Accepted because network and shared use are not supported.
- Data at rest is plaintext JSON in browser storage, the data file, and backups; protection relies on OS/browser-profile access controls only. Accepted; the tool must not be used to store secrets, health data, or account numbers, and use is at the operator's own risk.

## Known Limitations and Compensating Controls

- No multi-user authentication: anyone who can load the page obtains the token. Accepted for the supported single-user deployment; loopback default plus `Host`/`Origin` checks (`serve.mjs:136`, `serve.mjs:144`) are the compensating controls, effective only while `--host` stays loopback.
- Non-loopback bind is warning-only (`serve.mjs:471`); no TLS is provided. Remote/shared deployment is not a supported mode.
- `unsafe-inline` scripts are required by the single-file design (`prompt-manager.html:13`); safety rests on the escape/sanitize pipeline and its tests (`tests/security.test.mjs:7`).
- Server-side state validation is shallow (`serve.mjs:93`) compared with client-side normalization (`prompt-manager.html:1811`); direct `/api/state` callers are not a supported input class (owner default 24.11.2026).
- `/api/health` discloses PID and port to any `Host`-checked caller (`serve.mjs:162`), intended for `--ensure` probing (`serve.mjs:390`). Accepted under the loopback-only deployment.
- Data at rest is plaintext JSON in browser storage, the data file, and backups; protection relies on OS/browser-profile access controls. The token is memory-only and rotates per restart (`serve.mjs:115`) — a compensating property, not a rotation policy.

## Owner Decisions (confirmed 24.11.2026)

- Deployment: strictly single-user on a trusted machine, default loopback bind only. No network (LAN/WAN) or shared use is supported. Public source code (GitHub) does not change this; user data is never committed.
- Sensitivity: the owner's own library currently contains no secrets. Use is at the operator's own risk; the owner takes no responsibility for the loss of secrets or personal data. Secrets, health data, and account numbers must not be stored. Other users are responsible for their own data.
- Owner and security-report contact: the owner's GitHub account; reports via GitHub Issues or the repository's private vulnerability-reporting channel. No private email is published.
- Scope of generated artifacts and local docs: out of scope for source scanning (owner-confirmed); the never-commit obligation stands.
- Autostart (default accepted 24.11.2026, adjustable): the Windows autostart workflow is the only supported privileged workflow; manual `node serve.mjs` use on other OSes is not policy-supported.
- Severity and accepted risks: as stated in this document.
