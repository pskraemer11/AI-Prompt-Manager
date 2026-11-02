import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackupServer, probeServer, TOKEN_PLACEHOLDER, APP_ID } from '../serve.mjs';

const run = promisify(execFile);
const SERVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'serve.mjs');

const directory = await mkdtemp(path.join(tmpdir(), 'pm-server-'));
const dataFile = path.join(directory, 'data.json');
const app = await startBackupServer({ port: 0, dataFile });
const headers = { 'X-PM-Token': app.token };

after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
});

test('liefert die App mit injiziertem Token, aber ohne JavaScript-Platzhalter zu ersetzen', async () => {
    const response = await fetch(app.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);

    const html = await response.text();
    assert.ok(html.includes(`<meta name="prompt-manager-server" content="${app.token}">`));
    assert.ok(html.includes(`tokenPlaceholder: '${TOKEN_PLACEHOLDER}'`));
    assert.ok(!html.includes(`content="${TOKEN_PLACEHOLDER}"`));
});

test('API verlangt das Token', async () => {
    const response = await fetch(`${app.url}api/state`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
});

test('leerer Zustand wird als empty gemeldet', async () => {
    const response = await fetch(`${app.url}api/state`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { empty: true });
});

test('Zustand wird gespeichert, gelesen und als .bak gesichert', async () => {
    const state = {
        version: '2.2',
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_1',
            title: 'Titel',
            category: 'coding',
            content: 'Inhalt',
            tags: [],
            createdAt: '2026-11-02T00:00:00.000Z',
            updatedAt: '2026-11-02T00:00:00.000Z'
        }]
    };

    const put = await fetch(`${app.url}api/state`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
    });
    assert.equal(put.status, 200);
    const result = await put.json();
    assert.equal(result.ok, true);
    assert.match(result.savedAt, /^\d{4}-\d{2}-\d{2}T/);

    const get = await fetch(`${app.url}api/state`, { headers });
    const stored = await get.json();
    assert.equal(stored.prompts.length, 1);
    assert.equal(stored.prompts[0].title, 'Titel');
    assert.equal(stored.categories.length, 1);

    const onDisk = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.equal(onDisk.prompts.length, 1);
    assert.equal(onDisk.savedAt, result.savedAt);

    // Zweites Schreiben erzeugt die Sicherung des vorherigen Stands.
    await fetch(`${app.url}api/state`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
    });
    const backup = JSON.parse(await readFile(`${dataFile}.bak`, 'utf8'));
    assert.equal(backup.prompts.length, 1);
});

test('ungültige Eingaben werden abgelehnt', async () => {
    const invalidJson = await fetch(`${app.url}api/state`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{'
    });
    assert.equal(invalidJson.status, 400);

    const invalidShape = await fetch(`${app.url}api/state`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: [], prompts: 'nein' })
    });
    assert.equal(invalidShape.status, 400);

    const missingToken = await fetch(`${app.url}api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: [], prompts: [] })
    });
    assert.equal(missingToken.status, 401);
});

test('nur die App und der API-Pfad sind erreichbar', async () => {
    const unknown = await fetch(`${app.url}unbekannt`);
    assert.equal(unknown.status, 404);

    const traversal = await fetch(`${app.url}../serve.mjs`);
    assert.equal(traversal.status, 404);

    const wrongMethod = await fetch(`${app.url}api/state`, {
        method: 'POST',
        headers
    });
    assert.equal(wrongMethod.status, 405);
});

function rawRequest(url, options, body = null) {
    return new Promise((resolve, reject) => {
        const request = httpRequest(url, options, (response) => {
            response.resume();
            response.on('end', () => resolve(response));
        });
        request.on('error', reject);
        if (body) request.write(body);
        request.end();
    });
}

test('fremder Host-Header wird abgelehnt (DNS-Rebinding)', async () => {
    const response = await rawRequest(`${app.url}api/state`, {
        headers: { Host: 'evil.example', 'X-PM-Token': app.token }
    });
    assert.equal(response.statusCode, 403);
});

test('fremde Origin wird bei PUT abgelehnt', async () => {
    const response = await rawRequest(`${app.url}api/state`, {
        method: 'PUT',
        headers: {
            Host: `127.0.0.1:${app.port}`,
            Origin: 'http://evil.example',
            'X-PM-Token': app.token,
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({ categories: [], prompts: [] }));
    assert.equal(response.statusCode, 403);
});

test('Status-Endpunkt meldet die App ohne Token', async () => {
    const response = await fetch(`${app.url}api/health`);
    assert.equal(response.status, 200);

    const health = await response.json();
    assert.equal(health.app, APP_ID);
    assert.equal(health.port, app.port);
});

test('probeServer erkennt eigene, fremde und fehlende Server', async () => {
    const own = await probeServer({ port: app.port });
    assert.equal(own.ours, true);
    assert.equal(own.health.app, APP_ID);

    const foreign = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ app: 'etwas-anderes' }));
    });
    await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
    const foreignPort = foreign.address().port;

    try {
        const other = await probeServer({ port: foreignPort });
        assert.equal(other.running, true);
        assert.equal(other.ours, false);
    } finally {
        await new Promise((resolve) => foreign.close(resolve));
    }

    const missing = await probeServer({ port: foreignPort, timeoutMs: 400 });
    assert.equal(missing.running, false);
    assert.equal(missing.ours, false);
});

test('--ensure startet keinen zweiten Server und beendet sich sauber', async () => {
    const { stdout } = await run(process.execPath, [
        SERVE,
        '--ensure',
        '--no-open',
        '--port', String(app.port)
    ]);

    assert.match(stdout, /läuft bereits/);

    // Der bestehende Server ist weiterhin erreichbar und behaelt sein Token.
    const response = await fetch(`${app.url}api/state`, { headers });
    assert.equal(response.status, 200);
});

test('--ensure meldet einen fremd belegten Port', async () => {
    const foreign = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('belegt');
    });
    await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
    const foreignPort = foreign.address().port;

    try {
        await assert.rejects(
            run(process.execPath, [SERVE, '--ensure', '--no-open', '--port', String(foreignPort)]),
            (error) => {
                assert.equal(error.code, 1);
                assert.match(String(error.stderr), /anderen Programm belegt/);
                return true;
            }
        );
    } finally {
        await new Promise((resolve) => foreign.close(resolve));
    }
});
