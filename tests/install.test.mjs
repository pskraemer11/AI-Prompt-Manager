import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
    buildStartupScript,
    parseArgs,
    startupEntryPath,
    desktopEntryPath
} from '../scripts/install-autostart.mjs';

const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
const servePath = 'C:\\Users\\test\\Python-Projekte\\AI+IDE-Hints\\tools\\ai-prompt-manager\\serve.mjs';
const logPath = 'C:\\Users\\test\\Python-Projekte\\AI+IDE-Hints\\tools\\ai-prompt-manager\\prompt-manager-server.log';

test('Startskript startet den Server unsichtbar und idempotent', () => {
    const script = buildStartupScript({ nodePath, servePath, logPath });

    assert.match(script, /shell\.Run /);
    assert.match(script, /, 0, False/);
    assert.match(script, /--ensure/);
    assert.match(script, /--no-open/);
    assert.match(script, /--log/);
    assert.ok(!script.includes('--port'), 'Standardport wird nicht mitgeschrieben');

    // Das VBS-Literal zurückübersetzen: verdoppelte Anführungszeichen sind
    // ein Anführungszeichen. So bleibt ein Pfad mit Leerzeichen ein Argument.
    const literal = script.split('shell.Run ')[1].split(', 0, False')[0];
    assert.ok(literal.startsWith('"') && literal.endsWith('"'));
    const command = literal.slice(1, -1).replace(/""/g, '"');

    assert.ok(command.startsWith('"C:\\Program Files\\nodejs\\node.exe" "'));
    assert.ok(command.includes('\\serve.mjs" --ensure --log "'));
    assert.ok(command.endsWith('--no-open'));
});

test('Desktop-Variante öffnet den Browser, Autostart nicht', () => {
    const autostart = buildStartupScript({ nodePath, servePath, logPath });
    const desktop = buildStartupScript({ nodePath, servePath, logPath, open: true });

    assert.ok(autostart.includes('--no-open'));
    assert.ok(!desktop.includes('--no-open'));
    assert.ok(desktop.includes('--ensure'));
});

test('abweichender Port wird übergeben', () => {
    const script = buildStartupScript({ nodePath, servePath, logPath, port: 8766 });
    assert.ok(script.includes('--port'));
    assert.ok(script.includes('8766'));
});

test('Start- und Desktop-Pfad liegen im Benutzerprofil', () => {
    const startup = startupEntryPath('C:\\Users\\test\\AppData\\Roaming');
    assert.equal(
        startup,
        path.join('C:\\Users\\test\\AppData\\Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Prompt Manager (Server).vbs')
    );

    const desktop = desktopEntryPath('C:\\Users\\test');
    assert.equal(desktop, path.join('C:\\Users\\test', 'Desktop', 'Prompt Manager.vbs'));
});

test('fehlende Umgebungsvariablen werden gemeldet', () => {
    assert.throws(() => startupEntryPath(''), /APPDATA/);
    assert.throws(() => desktopEntryPath(''), /USERPROFILE/);
});

test('Optionen werden gelesen und Unbekanntes abgelehnt', () => {
    assert.deepEqual(parseArgs([]), {
        port: 8765,
        uninstall: false,
        status: false,
        dryRun: false,
        noOpen: false,
        help: false
    });

    const parsed = parseArgs(['--port', '9000', '--uninstall', '--no-open']);
    assert.equal(parsed.port, 9000);
    assert.equal(parsed.uninstall, true);
    assert.equal(parsed.noOpen, true);

    assert.throws(() => parseArgs(['--port', '0']), /port/);
    assert.throws(() => parseArgs(['--unbekannt']), /Unbekannte Option/);
});
