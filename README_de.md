# Prompt Manager Pro

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
- **Chatverlauf einfügen:** Chatverläufe aus beliebigen Chat-KIs einfügen (📋-Button).
  Markdown (Überschriften, Tabellen, Listen, Task-Listen, Code, Zitate, Fett/Kursiv,
  Bilder, Links) wird live in der Vorschau gerendert und in der Detailansicht formatiert angezeigt.
- **Kategorien:** über ⚙️ Kategorien anlegen, umbenennen, mit Icon versehen.

## Hinweise

- Die Daten liegen im LocalStorage des Browsers.
  **WICHTIG:** Regelmäßig Export als Backup durchführen — beim Löschen des Browser-Caches/Profils sind die Daten weg.
- Einzige Abhängigkeit: keine (rein lokales, eigenständiges HTML).
- Das exportierte Backup-JSON kann persönliche Inhalte enthalten — bewusst außerhalb
  des Repositoriums halten.

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
