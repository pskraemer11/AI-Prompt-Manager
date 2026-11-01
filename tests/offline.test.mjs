import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const { html, api } = await loadApp();

test('CSP verbietet Netzwerkziele und erlaubt nur eingebettete Bilder', () => {
    const match = html.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)">/);
    assert.ok(match, 'CSP-Meta fehlt');

    const policy = match[1];
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'unsafe-inline'/);
    assert.match(policy, /style-src 'unsafe-inline'/);
    assert.match(policy, /img-src data:/);
    assert.match(policy, /connect-src 'none'/);
    assert.match(policy, /form-action 'none'/);
    assert.match(policy, /base-uri 'none'/);
    assert.match(policy, /object-src 'none'/);
});

test('keine externen Ressourcen im Markup', () => {
    const externalTag = /<(?:script|img|link|iframe|source|audio|video|object|embed)\b[^>]*\b(?:src|href)\s*=\s*["']https?:/i;
    assert.doesNotMatch(html, externalTag);
    assert.doesNotMatch(html, /<script[^>]+\bsrc=/i);
});

test('keine Netzwerk-APIs im Anwendungscode', () => {
    assert.doesNotMatch(html, /\bfetch\s*\(/);
    assert.doesNotMatch(html, /XMLHttpRequest/);
    assert.doesNotMatch(html, /sendBeacon/);
    assert.doesNotMatch(html, /new\s+WebSocket/);
    assert.doesNotMatch(html, /new\s+EventSource/);
    assert.doesNotMatch(html, /importScripts/);
});

test('alle Modals sind als modale Dialoge ausgezeichnet', () => {
    const modals = html.match(/<div class="modal"[^>]*>/g) || [];
    assert.equal(modals.length, 5);
    for (const modal of modals) {
        assert.match(modal, /role="dialog"/);
        assert.match(modal, /aria-modal="true"/);
        assert.match(modal, /aria-hidden="true"/);
    }
});

test('jeder Inline-Handler verweist auf eine vorhandene Funktion', () => {
    const handlers = new Set();
    for (const match of html.matchAll(/\bon(?:click|keydown|change|input)="([A-Za-z_$][\w$]*)\(/g)) {
        handlers.add(match[1]);
    }

    assert.ok(handlers.size > 0);
    for (const handler of handlers) {
        assert.match(html, new RegExp(`function\\s+${handler}\\s*\\(`), `Handler fehlt: ${handler}`);
    }
});

test('jede per getElementById referenzierte ID existiert im Markup', () => {
    const ids = new Set();
    for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
        ids.add(match[1]);
    }

    // Wird erst zur Laufzeit im Kategorie-Editor erzeugt.
    const dynamicIds = new Set(['categoryNameInput']);

    for (const match of html.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const id = match[1];
        if (dynamicIds.has(id)) continue;
        assert.ok(ids.has(id), `ID fehlt im Markup: ${id}`);
    }
});

test('Backup-Datei und Browser-Speicher-Status sind verdrahtet', () => {
    assert.match(html, /id="storageBanner"/);
    assert.match(html, /id="storageStatus"/);
    assert.match(html, /id="connectFileBtn"/);
    assert.match(html, /showSaveFilePicker/);
    assert.match(html, /beforeunload/);
    assert.equal(api.isFileBackupSupported(), false);
});

test('Detailansicht bietet das Verschieben in eine andere Kategorie', () => {
    assert.match(html, /id="moveCategorySelect"/);
    assert.match(html, /onclick="moveCurrentPrompt\(\)"/);
});
