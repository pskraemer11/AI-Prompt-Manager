# AI Prompt Manager / KISS Design

Local AI prompt management with categories, tags, import/export, and Markdown display. 

Runs entirely in the browser - everything stays on the device (LocalStorage).
No data leaves the device, and no internet connection is required (no CDN, no requests).

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
- **Import chat history:** Import chat histories from any chat AI (📋 button).
  Markdown (headings, tables, lists, task lists, code, quotes, bold/italics,
  images, links) is rendered live in the preview and displayed formatted in the detail view.
- **Categories:** Use ⚙️ to create, rename, and assign icons to categories.

## Notes

- Data is stored in the browser's LocalStorage.
  **IMPORTANT:** Export regularly as a backup — deleting the browser cache or profile will erase the data.
- Only dependency: none (purely local, standalone HTML).
- The exported backup JSON may contain personal content—keep it intentionally outside
  the repository.

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
