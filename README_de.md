# AI Prompt Manager / KISS Design

Lokale Verwaltung von KI-Prompts mit Kategorien, Tags, Import-/Exportfunktionen und Markdown-Anzeige.

Läuft vollständig im Browser – alle Daten bleiben auf dem Gerät (LocalStorage).
Es verlassen keine Daten das Gerät, und es ist keine Internetverbindung erforderlich (kein CDN, keine Anfragen).

KISS steht für „Keep it simple, stupid“.

## Screenshots

| Erster Start (leer, ohne Daten) | Prompt-Bibliothek mit Kategorien |
| :---: | :---: |
| ![Erster Start](docs/screenshots/pm-start.png) | ![Prompt-Bibliothek](docs/screenshots/pm-list.png) |
| **Detailansicht** — Markdown live gerendert | **Chatverlauf einfügen** — mit Live-Vorschau |
| ![Detailansicht](docs/screenshots/pm-detail.png) | ![Chatverlauf](docs/screenshots/pm-chat-modal.png) |

## Benutzung

- **Start:** `prompt-manager.html` im Browser öffnen. Kein Server, keine Installation.
- **Export / Import:** Daten als JSON sichern (📤 Export) und wiederherstellen (📥 Import).
  Der Import **mischt statt überschreibt**: bestehende Kategorien und Prompts bleiben erhalten,
  neue kommen dazu; Doppelungen (gleiche ID oder identischer Titel + Inhalt) werden übersprungen.
  Importe werden geprüft und begrenzt; Einträge mit ungültigen Feldern werden gemeldet und übersprungen.
- **Chatverlauf einfügen:** Chatverläufe aus beliebigen Chat-KIs einfügen (📋-Button).
  Markdown (Überschriften, Tabellen, Listen, Task-Listen, Code, Zitate, Fett/Kursiv,
  Bilder, Links) wird live in der Vorschau gerendert und in der Detailansicht formatiert angezeigt.
- **Kategorien:** über ⚙️ Kategorien anlegen, umbenennen, mit Icon versehen.
  In der Detailansicht gibt es eine **Verschiebe-Auswahl**, um einen Prompt einer anderen Kategorie zuzuordnen.
- **Datei-Backup:** In Chromium-Browsern verbindet 📁 **Backup-Datei** eine JSON-Datei.
  Jede Änderung wird in diese Datei geschrieben; damit überleben die Daten auch
  Browsereinstellungen, die beim Schließen Cookies und Website-Daten löschen.
  Die App stellt die Daten auf Wunsch aus dieser Datei wieder her.
- **Browser-Speicher-Warnung:** Ohne verbundene Datei warnt die App beim Schließen,
  wenn Änderungen noch nicht in eine Datei gesichert wurden.

## Datenspeicherung und Backup

Die Daten liegen im LocalStorage des Browsers. **Browsereinstellungen, die beim Schließen
Cookies oder Website-Daten löschen, löschen auch den LocalStorage** – ohne Backup sind die
Daten danach weg.

Zwei voneinander unabhängige Sicherungen sind eingebaut:

1. **JSON-Export** (📤) lädt ein datiertes `prompt-manager-backup-*.json` herunter.
2. **Datei-Backup** (📁) hält eine JSON-Datei außerhalb des Browsers aktuell.
   Voraussetzung ist die File System Access API (Chrome, Edge, Chromium);
   in Firefox bleibt Export/Import der Weg.

Beim Start mit leerem LocalStorage zeigt die App einen Wiederherstellungs-Hinweis
und im leeren Zustand einen Import-Button. Bestehende Backups bleiben importierbar.

`prompt-manager-backup-*.json` ist gitignored, weil die Datei persönliche Inhalte enthalten kann.

## Sicherheit und Datenschutz

- **Offline-Zusage:** Die Seite lädt keine externen Skripte, Styles, Fonts oder Bilder.
  Eine Content-Security-Policy blockiert Netzwerkverbindungen (`connect-src 'none'`,
  `img-src data:`, `default-src 'none'`).
- **Externe Bilder in Markdown werden nicht geladen.** Sie erscheinen als Link mit dem
  Hinweis „(extern, nicht geladen)“; nur eingebettete `data:image/...`-Rasterbilder werden angezeigt.
- **HTML wird escaped** in Prompts, Kategorien, Tags und Markdown. Attributwerte escapen
  Anführungszeichen; Links erlauben nur `http(s)`, `mailto`, relative Pfade und Fragmente.
  `javascript:`, `data:`, `file:` und protokollrelative URLs werden blockiert.
- **Importprüfung:** Schema-Prüfung, Größenlimits (25 MB Datei, 10.000 Prompts,
  500 Kategorien), Feldnormalisierung und Kürzung von Inhalten auf 50.000 Zeichen.

## Grenzen

| Feld | Limit |
| --- | --- |
| Titel | 100 Zeichen |
| Inhalt | 50.000 Zeichen |
| Tags | 20 pro Prompt, je 40 Zeichen |
| Kategoriename | 50 Zeichen |
| Importdatei | 25 MB |

## Entwicklung

Voraussetzung: Node.js 20 oder neuer. Es gibt keine npm-Abhängigkeiten.

```powershell
npm test          # Verhaltenstests (node:test + node:vm, ohne Browser)
npm run check     # statische Prüfung: Syntax, CSP, Offline-Grenzen, IDs, Handler
npm run verify    # beides
```

Die Git-Hooks (lokaler Secret-Scan, Privacy-Guard, Test-Gate) stammen aus der
gemeinsamen Vorlage und werden pro Klon aktiviert:

```powershell
git config core.hooksPath .githooks
```

Das Gate führt `node scripts/check.mjs`, `actionlint` und `npm test` aus. Die CI
testet auf Ubuntu und Windows, prüft die Workflows mit actionlint und führt die
Privacy-/Secret-Prüfung für jeden Push und Pull Request aus.

Die Anwendung stellt eine kleine Testfläche als `window.PromptManager` bereit
(Markdown-Renderer, URL-Sanitizer, Importprüfung, Merge- und Verschiebe-Logik).
Die Tests laden das echte Inline-Skript aus `prompt-manager.html`; es gibt keine
Kopie der Implementierung in der Testsuite.

## Lizenz

Copyright (C) 2026 pskraemer11

Dieses Programm ist freie Software: Sie können es unter den Bedingungen der GNU
General Public License, wie von der Free Software Foundation veröffentlicht,
weitergeben und/oder modifizieren, und zwar unter Version 3 der Lizenz oder
(nach Ihrer Option) jeder späteren Version. Der vollständige Lizenztext steht in
[LICENSE](LICENSE).

SPDX-License-Identifier: GPL-3.0-or-later

*Hinweis:* Die GPL verlangt kein Veröffentlichen von Kontaktdaten; wer will, ergänzt
im Lizenzhinweis eine Kontaktadresse — bei GitHub reicht üblicherweise der Profil-Link.
