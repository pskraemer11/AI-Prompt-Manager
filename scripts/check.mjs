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

// --- Syntax des optionalen Servers ------------------------------------------
try {
    execFileSync(process.execPath, ['--check', `${ROOT}serve.mjs`], { stdio: 'pipe' });
    notes.push('serve.mjs syntaktisch gültig');
} catch (error) {
    fail(`serve.mjs ist kein gültiges JavaScript: ${error.message}`);
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

// --- Ausgabe ----------------------------------------------------------------
if (errors.length > 0) {
    console.error(`check: ${errors.length} Problem(e) gefunden`);
    for (const message of errors) console.error(`  - ${message}`);
    process.exitCode = 1;
} else {
    console.log(`check: OK (${ids.size} IDs, ${handlers.size} Handler, ${modals.length} Modals)`);
    for (const note of notes) console.log(`  - ${note}`);
}
