# AI Prompt Manager / KISS Design

Local AI prompt management with categories, tags, import/export, and Markdown display.

Runs entirely in the browser - everything stays on the device (LocalStorage).
No data leaves the device, and no internet connection is required (no CDN, no external requests).
The optional local server (see below) only talks to 127.0.0.1.

KISS means "Keep it simple, stupid".

## Screenshots

| First start (clean, no data) | Prompt library with categories |
| :---: | :---: |
| ![First start](docs/screenshots/pm-start.png) | ![Prompt library](docs/screenshots/pm-list.png) |
| **Detail view** — Markdown rendered live | **Chat history import** — with live preview |
| ![Detail view](docs/screenshots/pm-detail.png) | ![Chat import](docs/screenshots/pm-chat-modal.png) |

## Usage

- **To get started:** Open `prompt-manager.html` in your browser. No server, no installation.
- **Export / Import:** Back up data as JSON (📤 Export) and restore it (📥 Import).
  The import **merges rather than overwrites**: existing categories and prompts are preserved,
  new ones are added; duplicates (same ID or identical title + content) are skipped.
  Imports are validated and limited; entries with invalid fields are reported and skipped.
- **Import chat history:** Import chat histories from any chat AI (📋 button).
  Markdown (headings, tables, lists, task lists, code, quotes, bold/italics,
  images, links) is rendered live in the preview and displayed formatted in the detail view.
- **Categories:** Use ⚙️ to create, rename, and assign icons to categories.
  The detail view has a **move control** to move a prompt to another category.
- **File backup:** In Chromium browsers, 📁 **Backup-Datei** connects a JSON file.
  Every change is written back to that file, so the data survives browser settings
  that delete cookies and site data on close. The app restores from that file on demand.
  In Firefox and Safari the same button downloads a dated JSON backup instead
  (no error); restore it with **Import** after a restart.
- **Local server (Firefox, Chrome, Edge):** `npm start` (or `node serve.mjs`) serves the app at
  `http://127.0.0.1:8765/` and writes every change to `prompt-manager-data.json` next to the HTML.
  This is the automatic backup path for Firefox and Safari. Options: `--port`, `--data`, `--no-open`.
  The server binds to loopback, uses a random same-origin token, and is optional; the standalone
  HTML remains fully local.
- **Browser storage warning:** If no file or server backup is active, the app warns before
  closing the tab while there are unsaved changes.

## Data storage and backup

Data is stored in the browser's LocalStorage. **Browser settings that clear cookies
or site data on close also clear LocalStorage** - in that case the data is gone after
closing the browser unless a backup exists.

Three independent safety nets are built in:

1. **JSON export** (📤) downloads a dated `prompt-manager-backup-*.json`.
2. **File backup** (📁) keeps a JSON file outside the browser and updates it after
   every change. Requires the File System Access API (Chrome, Edge, Chromium;
   in Brave it is currently behind a flag). In Firefox and Safari the same button
   downloads a dated JSON backup instead; restore it with **Import**.
3. **Local server** (`node serve.mjs`) keeps the data in `prompt-manager-data.json` on disk
   and updates it after every change. This works in Firefox and Safari, where the File System
   Access API is unavailable. The server only listens on 127.0.0.1 and requires a per-session token.

On startup with an empty LocalStorage, the app shows a restore banner and an
import button in the empty state. Existing backups remain importable.

`prompt-manager-backup-*.json`, `prompt-manager-data.json` and its `.bak` are gitignored
because they may contain personal content.

## Security and privacy

- **Offline guarantee:** The page loads no external scripts, styles, fonts, or images.
  The CSP restricts connections to the same origin (`connect-src 'self'`); the optional
  local server uses only 127.0.0.1, and the standalone file makes no requests at all.
  `img-src data:` and `default-src 'none'` remain in force.
- **External images in Markdown are not loaded.** They are rendered as a link marked
  "(external, not loaded)"; only embedded `data:image/...` raster images are displayed.
- **HTML is escaped** in prompts, categories, tags, and Markdown. Attribute values
  escape quotes; links allow only `http(s)`, `mailto`, relative paths, and fragments.
  `javascript:`, `data:`, `file:`, and protocol-relative URLs are blocked.
- **Import validation:** schema checks, size limits (25 MB file, 10,000 prompts,
  500 categories), field normalization, and content truncation at 50,000 characters.

## Limits

| Field | Limit |
| --- | --- |
| Title | 100 characters |
| Content | 50,000 characters |
| Tags | 20 per prompt, 40 characters each |
| Category name | 50 characters |
| Import file | 25 MB |

## Development

Requirements: Node.js 20 or newer. There are no npm dependencies.

```powershell
npm test          # behavior tests (node:test + node:vm, no browser needed)
npm run check     # static checks: syntax, CSP, offline limits, IDs, handlers
npm run verify    # both
npm start         # optional local server, http://127.0.0.1:8765/
bash scripts/hooks-testrun.sh   # five pre-push hook probes (Git Bash)
```

Git hooks (local secret scan, privacy guard, test gate) come from the shared
template and are activated per clone:

```powershell
git config core.hooksPath .githooks
```

The gate runs `node scripts/check.mjs`, `actionlint`, and `npm test`. The hooks
additionally need `gitleaks` and `actionlint` (`winget install Gitleaks.Gitleaks
rhysd.actionlint`); `pre-push` fails closed when `gitleaks` is missing. CI runs the
same tests on Ubuntu and Windows, checks the workflows with actionlint, and runs
the privacy/secret hook for every push and pull request.

The application exposes a small test surface as `window.PromptManager`
(Markdown renderer, URL sanitizer, import validation, merge and move logic).
Tests load the real inline script from `prompt-manager.html`; there is no copy
of the implementation in the test suite. `tests/server.test.mjs` starts the
local server on an ephemeral port and checks token auth, persistence, backups,
and path handling.

## License

Copyright (C) 2026 pskraemer11

This program is free software: You may redistribute and/or modify it under the terms of the GNU
General Public License, as published by the Free Software Foundation,
either under Version 3 of the License or
(at your option) any later version. The full text of the license is available at
[LICENSE](LICENSE).

SPDX-License-Identifier: GPL-3.0-or-later

*Note:* The GPL does not require the publication of contact information; if you wish, you may include
a contact address in the license notice—on GitHub, a profile link is usually sufficient.
