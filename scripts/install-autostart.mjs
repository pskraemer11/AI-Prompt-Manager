#!/usr/bin/env node
/**
 * Richtet den optionalen Prompt-Manager-Server so ein, dass er ohne manuellen
 * Start verfügbar ist.
 *
 * Warum das nötig ist: Ein Lesezeichen im Browser darf aus Sicherheitsgründen
 * keine lokalen Programme starten. Der Server muss daher laufen, bevor das
 * Lesezeichen geklickt wird. Dieses Skript legt dafür zwei Startdateien an:
 *
 *   1. Autostart (Windows-Startordner): startet den Server unsichtbar bei der
 *      Anmeldung. Danach funktioniert das Lesezeichen jederzeit.
 *   2. Desktop-Symbol: startet den Server bei Bedarf nach (falls er beendet
 *      wurde) und öffnet die App im Standardbrowser.
 *
 * Aufruf:
 *   node scripts/install-autostart.mjs            # einrichten und starten
 *   node scripts/install-autostart.mjs --status   # Zustand anzeigen
 *   node scripts/install-autostart.mjs --uninstall
 *   node scripts/install-autostart.mjs --dry-run  # nur anzeigen, nichts schreiben
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { probeServer, openBrowser } from '../serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVE = path.join(ROOT, 'serve.mjs');
const LOG = path.join(ROOT, 'prompt-manager-server.log');
const STARTUP_NAME = 'Prompt Manager (Server).vbs';
const DESKTOP_NAME = 'Prompt Manager.vbs';

export function parseArgs(argv) {
    const options = {
        port: 8765,
        uninstall: false,
        status: false,
        dryRun: false,
        noOpen: false,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = () => {
            index += 1;
            if (index >= argv.length) throw new Error(`Wert fehlt für ${argument}`);
            return argv[index];
        };

        if (argument === '--port') {
            const value = Number(next());
            if (!Number.isInteger(value) || value < 1 || value > 65535) {
                throw new Error('--port erwartet eine Zahl zwischen 1 und 65535');
            }
            options.port = value;
        } else if (argument === '--uninstall') {
            options.uninstall = true;
        } else if (argument === '--status') {
            options.status = true;
        } else if (argument === '--dry-run') {
            options.dryRun = true;
        } else if (argument === '--no-open') {
            options.noOpen = true;
        } else if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unbekannte Option: ${argument}`);
        }
    }

    return options;
}

function quoteArgument(value) {
    return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Erzeugt den Inhalt der VBS-Datei. WScript startet den Prozess mit
 * Fensterstil 0 (unsichtbar), damit weder Konsole noch Fenster erscheinen.
 */
export function buildStartupScript({ nodePath, servePath, logPath, port = 8765, open = false }) {
    const commandLine = [
        quoteArgument(nodePath),
        quoteArgument(servePath),
        '--ensure',
        '--log',
        quoteArgument(logPath),
        ...(open ? [] : ['--no-open']),
        ...(port !== 8765 ? ['--port', String(port)] : [])
    ].join(' ');
    // In VBS-Literalen wird ein Anführungszeichen verdoppelt.
    const vbsLiteral = `"${commandLine.replace(/"/g, '""')}"`;

    return [
        "' Automatisch erzeugt von scripts/install-autostart.mjs",
        "' Startet den lokalen Prompt-Manager-Server. Diese Datei löschen beendet den Start.",
        'Set shell = CreateObject("WScript.Shell")',
        `shell.Run ${vbsLiteral}, 0, False`,
        ''
    ].join('\r\n');
}

export function startupEntryPath(appData = process.env.APPDATA) {
    if (!appData) throw new Error('APPDATA ist nicht gesetzt.');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', STARTUP_NAME);
}

export function desktopEntryPath(home = process.env.USERPROFILE) {
    if (!home) throw new Error('USERPROFILE ist nicht gesetzt.');
    return path.join(home, 'Desktop', DESKTOP_NAME);
}

async function waitForServer(port, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const probe = await probeServer({ port, timeoutMs: 600 });
        if (probe.ours) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
}

function spawnServer(port) {
    const args = [SERVE, '--ensure', '--no-open', '--log', LOG];
    if (port !== 8765) args.push('--port', String(port));

    const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
}

async function showStatus(port) {
    const probe = await probeServer({ port });
    const startup = startupEntryPath();
    const desktop = desktopEntryPath();

    console.log(`Server:     ${probe.ours ? `läuft (Port ${port})` : 'läuft nicht'}`);
    console.log(`Autostart:  ${existsSync(startup) ? startup : 'nicht eingerichtet'}`);
    console.log(`Desktop:    ${existsSync(desktop) ? desktop : 'nicht eingerichtet'}`);
    console.log(`Lesezeichen: http://127.0.0.1:${port}/`);
}

async function install(options) {
    if (process.platform !== 'win32') {
        console.log('Autostart ist in diesem Skript nur für Windows umgesetzt.');
        console.log('Auf anderen Systemen: node serve.mjs --ensure --no-open als Dienst starten.');
        return;
    }

    const startupPath = startupEntryPath();
    const desktopPath = desktopEntryPath();
    const startupScript = buildStartupScript({
        nodePath: process.execPath,
        servePath: SERVE,
        logPath: LOG,
        port: options.port
    });
    const desktopScript = buildStartupScript({
        nodePath: process.execPath,
        servePath: SERVE,
        logPath: LOG,
        port: options.port,
        open: true
    });

    if (options.dryRun) {
        console.log(`Autostart: ${startupPath}`);
        console.log(`Desktop:   ${desktopPath}`);
        console.log(startupScript);
        return;
    }

    await mkdir(path.dirname(startupPath), { recursive: true });
    await writeFile(startupPath, startupScript, 'utf8');

    let desktopWritten = false;
    if (existsSync(path.dirname(desktopPath))) {
        await writeFile(desktopPath, desktopScript, 'utf8');
        desktopWritten = true;
    }

    console.log(`Autostart eingerichtet: ${startupPath}`);
    if (desktopWritten) console.log(`Desktop-Symbol:         ${desktopPath}`);
    else console.log('Desktop-Ordner nicht gefunden; Autostart ist trotzdem aktiv.');

    spawnServer(options.port);
    const ready = await waitForServer(options.port);
    const url = `http://127.0.0.1:${options.port}/`;

    if (!ready) {
        console.error('Der Server antwortet nicht. Protokoll: ' + LOG);
        process.exitCode = 1;
        return;
    }

    console.log(`Server läuft:           ${url}`);
    console.log('');
    console.log('Lesezeichen anlegen:');
    if (options.noOpen) {
        console.log(`  1. ${url} im Browser öffnen.`);
    } else {
        console.log(`  1. ${url} ist im Browser geöffnet.`);
    }
    console.log('  2. Strg+D drücken und "Lesezeichen-Symbolleiste" wählen.');
    console.log('  Danach genügt ein Klick auf das Lesezeichen - der Server läuft bereits.');
    console.log('');
    // Absolute Pfade: Diese Befehle funktionieren aus jedem Verzeichnis.
    const self = fileURLToPath(import.meta.url);
    console.log(`Zustand:   node "${self}" --status`);
    console.log(`Entfernen: node "${self}" --uninstall`);
    console.log('');
    console.log('Den Zustand zeigt auch die App selbst in der Seitenleiste an');
    console.log('("Server-Backup aktiv · HH:MM").');

    if (!options.noOpen) openBrowser(url);
}

async function uninstall() {
    const targets = [startupEntryPath(), desktopEntryPath()];

    for (const target of targets) {
        if (existsSync(target)) {
            await rm(target, { force: true });
            console.log(`entfernt: ${target}`);
        } else {
            console.log(`nicht vorhanden: ${target}`);
        }
    }

    console.log('Ein bereits laufender Server wird nicht beendet.');
    console.log('Beenden: im Task-Manager den Prozess "node.exe" mit serve.mjs beenden.');
}

function usage() {
    return [
        'Aufruf: node scripts/install-autostart.mjs [Optionen]',
        '',
        '  --port <n>   Port (Standard 8765)',
        '  --status     Zustand anzeigen, nichts ändern',
        '  --uninstall  Autostart und Desktop-Symbol entfernen',
        '  --dry-run    Nur anzeigen, was geschrieben würde',
        '  --no-open    Browser nach der Einrichtung nicht öffnen',
        '  --help       Diese Hilfe'
    ].join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log(usage());
        return;
    }
    if (options.status) {
        await showStatus(options.port);
        return;
    }
    if (options.uninstall) {
        await uninstall();
        return;
    }

    await install(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`install-autostart: ${error.message}`);
        process.exitCode = 1;
    });
}
