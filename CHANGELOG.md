# Changelog

All notable changes of this project are documented here (newest first).
Format follows [Keep a Changelog](https://keepachangelog.com/), versions use git tags.

## [1.0.0] — 2026-10-21

### Added

- Local prompt manager as a single HTML file: categories with icons and prompt counters,
  tags, full-text search over titles, content and tags.
- **Merge import:** importing a JSON backup keeps existing categories and prompts,
  adds new ones, and skips duplicates (same ID, or identical title + content).
- **Import chat history:** paste chat transcripts from any chat AI (📋 button).
- **Live Markdown preview** in the prompt form and in the chat-insert dialog, with
  a show/hide toggle; the detail view renders Markdown as well.
- **Fully local Markdown renderer** — no CDN, no network requests, strictly escaped
  (XSS-safe) output. Supports headings, lists incl. nesting, task lists, GFM tables
  with column alignment, code blocks, inline code, blockquotes, bold/italic/strikethrough,
  images, links and URL autolinking.
- **JSON export** as backup (`prompt-manager-backup-YYYY-MM-DD.json`).

### Security

- The app performs zero external HTTP(S) requests.
- Markdown output is generated exclusively from escaped text; a pasted `<script>`
  can never execute.
