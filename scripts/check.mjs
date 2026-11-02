// Statische Prüfungen für die Einzeldatei-Anwendung.
// Ergänzt die Verhaltenstests: Syntax, Einzeldatei-Zusagen, Offline-Grenzen,
// ID-/Handler-Verdrahtung und LF-Zeilenenden der Git-Hooks.

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML_PATH = `${ROOT}prompt-manager.html`;

const errors = [];
const notes = [];

function fail(message) {
    errors.push(message);
}

function check(condition, message) {
    if (!condition) fail(message);
}

const html = await readFile(HTML_PATH, 'utf8');

// --- Einzeldatei-Struktur ---------------------------------------------------
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
check(scriptMatches.length === 1, `Erwartet genau ein Inline-Skript, gefunden: ${scriptMatches.length}`);
check(!/<script[^>]+\bsrc=/i.test(html), 'Externes Skript-Tag gefunden');

const styleMatches = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
check(styleMatches.length === 1, `Erwartet genau ein Style-Element, gefunden: ${styleMatches.length}`);
check(!/<link[^>]+\brel=["']stylesheet["']/i.test(html), 'Externes Stylesheet gefunden');

// --- Syntax des Inline-Skripts ---------------------------------------------
if (scriptMatches.length === 1) {
    try {
        new vm.Script(scriptMatches[0][1], { filename: 'prompt-manager.inline.js' });
        notes.push('Inline-Skript syntaktisch gültig');
    } catch (error) {
        fail(`Inline-Skript ist kein gültiges JavaScript: ${error.message}`);
    }
}

// --- Syntax des optionalen Servers und des Installers -----------------------
for (const file of ['serve.mjs', 'scripts/install-autostart.mjs']) {
    try {
        execFileSync(process.execPath, ['--check', `${ROOT}${file}`], { stdio: 'pipe' });
        notes.push(`${file} syntaktisch gültig`);
    } catch (error) {
        fail(`${file} ist kein gültiges JavaScript: ${error.message}`);
    }
}

// --- Content-Security-Policy ------------------------------------------------
const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)">/);
if (!cspMatch) {
    fail('CSP-Meta fehlt');
} else {
    const policy = cspMatch[1];
    for (const directive of [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        'img-src data:',
        "connect-src 'self'",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'"
    ]) {
        check(policy.includes(directive), `CSP-Direktive fehlt: ${directive}`);
    }
}

// --- Offline-Grenzen --------------------------------------------------------
const externalTag = /<(?:script|img|link|iframe|source|audio|video|object|embed)\b[^>]*\b(?:src|href)\s*=\s*["']https?:/i;
check(!externalTag.test(html), 'Markup lädt eine externe Ressource');

for (const [pattern, label] of [
    [/\bfetch\(\s*(?!serverBackup\.endpoint)/, 'fetch() außerhalb des Server-Endpunkts'],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/sendBeacon/, 'sendBeacon'],
    [/new\s+WebSocket/, 'WebSocket'],
    [/new\s+EventSource/, 'EventSource'],
    [/importScripts/, 'importScripts']
]) {
    check(!pattern.test(html), `Netzwerk-API im Anwendungscode: ${label}`);
}

// --- Markup-Verdrahtung -----------------------------------------------------
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const dynamicIds = new Set(['categoryNameInput']);

for (const match of html.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const id = match[1];
    if (dynamicIds.has(id)) continue;
    check(ids.has(id), `getElementById verweist auf unbekannte ID: ${id}`);
}

const handlers = new Set(
    [...html.matchAll(/\bon(?:click|keydown|change|input)="([A-Za-z_$][\w$]*)\(/g)].map((match) => match[1])
);
check(handlers.size > 0, 'Keine Inline-Handler gefunden');
for (const handler of handlers) {
    check(
        new RegExp(`function\\s+${handler}\\s*\\(`).test(html),
        `Inline-Handler verweist auf unbekannte Funktion: ${handler}`
    );
}

const modals = html.match(/<div class="modal"[^>]*>/g) || [];
check(modals.length === 5, `Erwartet 5 Modals, gefunden: ${modals.length}`);
for (const modal of modals) {
    check(/role="dialog"/.test(modal), 'Modal ohne role="dialog"');
    check(/aria-modal="true"/.test(modal), 'Modal ohne aria-modal');
    check(/aria-hidden="true"/.test(modal), 'Modal ohne initiales aria-hidden');
}

// --- Git-Hooks: LF und Shebang ---------------------------------------------
const hookFiles = ['.githooks/pre-commit', '.githooks/commit-msg', '.githooks/pre-push'];
let hooksPresent = 0;
for (const relativePath of hookFiles) {
    const path = `${ROOT}${relativePath}`;
    try {
        await access(path);
    } catch (error) {
        continue;
    }
    hooksPresent += 1;
    const content = await readFile(path, 'utf8');
    check(!content.includes('\r'), `${relativePath} enthält CR (muss LF sein)`);
    check(content.startsWith('#!/usr/bin/env bash'), `${relativePath} beginnt nicht mit bash-Shebang`);
}
if (hooksPresent > 0 && hooksPresent !== hookFiles.length) {
    fail(`Unvollständige Hook-Installation: ${hooksPresent} von ${hookFiles.length}`);
}
if (hooksPresent === hookFiles.length) {
    notes.push('Git-Hooks vorhanden (LF, Shebang)');
}

// --- Dokumentation ----------------------------------------------------------
// README.md and README_de.md are published. CHANGELOG.md, PLANUNG.md and
// COMPACTIONS.md are local workspace documents: present on the author's disk,
// ignored by Git and never pushed. They are validated only when present.
const PUBLISHED_DOCS = ['README.md', 'README_de.md'];
const LOCAL_DOCS = ['CHANGELOG.md', 'PLANUNG.md', 'COMPACTIONS.md'];

const publishedDocs = new Map();
for (const file of PUBLISHED_DOCS) {
    try {
        const content = await readFile(`${ROOT}${file}`, 'utf8');
        publishedDocs.set(file, content);
        check(content.trim().length > 0, `${file} ist leer`);
        check(!content.includes('\r'), `${file} enthält CR (muss LF sein)`);
    } catch (error) {
        fail(`${file} fehlt oder ist nicht lesbar: ${error.message}`);
    }
}

const localDocs = new Map();
for (const file of LOCAL_DOCS) {
    try {
        const content = await readFile(`${ROOT}${file}`, 'utf8');
        localDocs.set(file, content);
        check(content.trim().length > 0, `${file} ist leer`);
        check(!content.includes('\r'), `${file} enthält CR (muss LF sein)`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            fail(`${file} ist nicht lesbar: ${error.message}`);
        }
    }
}

let packageVersion = null;
try {
    const packageJson = JSON.parse(await readFile(`${ROOT}package.json`, 'utf8'));
    packageVersion = packageJson.version;
    check(typeof packageVersion === 'string' && packageVersion.length > 0, 'package.json hat keine Version');
} catch (error) {
    fail(`package.json ist nicht lesbar oder kein gültiges JSON: ${error.message}`);
}

const changelog = localDocs.get('CHANGELOG.md');
if (changelog) {
    check(/^# Changelog[ \t]*$/m.test(changelog), 'CHANGELOG.md beginnt nicht mit "# Changelog"');
    if (packageVersion) {
        check(
            changelog.includes(`## [${packageVersion}]`),
            `CHANGELOG.md enthält keinen Abschnitt "## [${packageVersion}]"`
        );
    }
}

const planning = localDocs.get('PLANUNG.md');
if (planning) {
    check(/^#\s+\S/m.test(planning), 'PLANUNG.md hat keine Überschrift');
}

const gitignore = await readFile(`${ROOT}.gitignore`, 'utf8');
for (const file of LOCAL_DOCS) {
    const pattern = new RegExp(`^${file.replace(/\./g, '\\.')}[ \\t]*$`, 'm');
    check(pattern.test(gitignore), `.gitignore schützt ${file} nicht vor einer Veröffentlichung`);
}

try {
    const tracked = execFileSync('git', ['ls-files', '--', ...LOCAL_DOCS], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    check(
        tracked.length === 0,
        `Lokale Doku ist versioniert und würde veröffentlicht: ${tracked.replace(/\n/g, ', ')}`
    );
} catch (error) {
    // Ohne Git (z. B. Tarball) bleibt die .gitignore-Prüfung als Schutz.
}

if (publishedDocs.size === PUBLISHED_DOCS.length) {
    const versionLabel = packageVersion ? `Version ${packageVersion}` : 'Version unbekannt';
    const localState = localDocs.size > 0
        ? `lokale Doku: ${[...localDocs.keys()].join(', ')}`
        : 'keine lokale Doku im Arbeitsbaum';
    notes.push(`READMEs vorhanden (${versionLabel}); ${localState}`);
}

// --- Ausgabe ----------------------------------------------------------------
if (errors.length > 0) {
    console.error(`check: ${errors.length} Problem(e) gefunden`);
    for (const message of errors) console.error(`  - ${message}`);
    process.exitCode = 1;
} else {
    console.log(`check: OK (${ids.size} IDs, ${handlers.size} Handler, ${modals.length} Modals)`);
    for (const note of notes) console.log(`  - ${note}`);
}
