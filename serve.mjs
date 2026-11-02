#!/usr/bin/env node
/**
 * Optionaler lokaler Backup-Server für den Prompt Manager.
 *
 * Firefox und Safari können Dateien nicht direkt fortschreiben. Dieser Server
 * liefert die Einzeldatei-App unter http://127.0.0.1:<port>/ aus und speichert
 * jede Änderung in einer JSON-Datei neben der HTML-Datei. Die App erkennt den
 * Server am injizierten Token und schreibt dann automatisch dorthin.
 *
 * Sicherheit:
 * - bindet standardmäßig nur an 127.0.0.1
 * - API nur mit zufälligem Token (X-PM-Token), same-origin, kein CORS
 * - begrenzte Request-Größe, atomares Schreiben, .bak-Sicherung
 * - keine Verzeichnisauslieferung, nur die HTML-Datei und /api/state
 *
 * Aufruf:
 *   node serve.mjs [--port 8765] [--host 127.0.0.1] [--data DATEI] [--no-open]
 */

import { createServer } from 'node:http';
import {
    readFile,
    writeFile,
    rename,
    copyFile,
    mkdir,
    stat,
    appendFile
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const TOKEN_PLACEHOLDER = '__PM_SERVER_TOKEN__';
export const APP_ID = 'ai-prompt-manager';
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_PROMPTS = 10000;
const MAX_CATEGORIES = 500;

function sendJson(response, status, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin'
    });
    response.end(body);
}

function httpError(status, code) {
    const error = new Error(code);
    error.status = status;
    return error;
}

function tokenMatches(provided, expected) {
    if (typeof provided !== 'string') return false;
    const left = Buffer.from(provided);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readBody(request) {
    const chunks = [];
    let size = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw httpError(413, 'payload_too_large');
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('utf8');
}

export function validateState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw httpError(400, 'invalid_state');
    }
    if (!Array.isArray(raw.categories) || !Array.isArray(raw.prompts)) {
        throw httpError(400, 'invalid_state');
    }
    if (raw.categories.length > MAX_CATEGORIES || raw.prompts.length > MAX_PROMPTS) {
        throw httpError(413, 'too_many_entries');
    }

    for (const category of raw.categories) {
        if (!category || typeof category !== 'object' || Array.isArray(category)) {
            throw httpError(400, 'invalid_category');
        }
    }
    for (const prompt of raw.prompts) {
        if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
            throw httpError(400, 'invalid_prompt');
        }
    }

    return {
        version: typeof raw.version === 'string' ? raw.version.slice(0, 20) : '2.2',
        categories: raw.categories,
        prompts: raw.prompts
    };
}

export function createBackupServer(options = {}) {
    const root = options.root || ROOT;
    const htmlFile = options.htmlFile || path.join(root, 'prompt-manager.html');
    const dataFile = options.dataFile || path.join(root, 'prompt-manager-data.json');
    const token = options.token || crypto.randomBytes(32).toString('hex');
    const host = options.host || '127.0.0.1';

    const app = {
        server: null,
        token,
        host,
        htmlFile,
        dataFile,
        port: options.port ?? 8765,
        url: null
    };

    const server = createServer(async (request, response) => {
        try {
            // DNS-Rebinding abwehren: nur Loopback-Namen (oder der explizit
            // gebundene Host) werden bedient.
            const hostHeader = request.headers.host || '';
            const hostname = hostHeader.startsWith('[')
                ? hostHeader.slice(1, hostHeader.indexOf(']'))
                : hostHeader.split(':')[0];
            const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', host.toLowerCase()]);
            if (!allowedHosts.has(hostname.toLowerCase())) {
                sendJson(response, 403, { error: 'forbidden_host' });
                return;
            }

            // Schreibende Anfragen mit fremder Origin ablehnen. Fehlende
            // Origin ist z. B. curl; das Token bleibt Pflicht.
            if (request.method === 'PUT' && request.headers.origin) {
                const expectedOrigin = `http://${hostHeader}`;
                if (request.headers.origin !== expectedOrigin) {
                    sendJson(response, 403, { error: 'forbidden_origin' });
                    return;
                }
            }

            const url = new URL(request.url || '/', 'http://localhost');

            // Öffentlicher Status-Endpunkt: kein Token, aber gleiche Origin- und
            // Host-Prüfung. Dient nur dazu, eine bereits laufende Instanz zu
            // erkennen (--ensure), damit kein zweiter Server startet.
            if (url.pathname === '/api/health') {
                if (request.method !== 'GET') {
                    sendJson(response, 405, { error: 'method_not_allowed' });
                    return;
                }
                sendJson(response, 200, { app: APP_ID, pid: process.pid, port: app.port });
                return;
            }

            if (url.pathname === '/' || url.pathname === '/prompt-manager.html') {
                if (request.method !== 'GET' && request.method !== 'HEAD') {
                    sendJson(response, 405, { error: 'method_not_allowed' });
                    return;
                }

                const html = await readFile(htmlFile, 'utf8');
                const metaPattern = /<meta name="prompt-manager-server" content="__PM_SERVER_TOKEN__">/;
                if (!metaPattern.test(html)) {
                    throw httpError(500, 'token_placeholder_missing');
                }
                // Nur das Meta-Feld ersetzen: Der Platzhalter steht auch als
                // Konstante im JavaScript und muss dort unverändert bleiben.
                const body = html.replace(
                    metaPattern,
                    `<meta name="prompt-manager-server" content="${token}">`
                );

                response.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY',
                    'Content-Security-Policy': "frame-ancestors 'none'",
                    'Cross-Origin-Resource-Policy': 'same-origin',
                    'Referrer-Policy': 'no-referrer'
                });
                response.end(request.method === 'HEAD' ? undefined : body);
                return;
            }

            if (url.pathname === '/api/state') {
                if (!tokenMatches(request.headers['x-pm-token'], token)) {
                    sendJson(response, 401, { error: 'unauthorized' });
                    return;
                }

                if (request.method === 'GET') {
                    if (!existsSync(dataFile)) {
                        sendJson(response, 200, { empty: true });
                        return;
                    }

                    const info = await stat(dataFile);
                    if (info.size > MAX_BODY_BYTES) {
                        throw httpError(413, 'data_too_large');
                    }

                    const text = await readFile(dataFile, 'utf8');
                    let parsed;
                    try {
                        parsed = JSON.parse(text);
                    } catch (error) {
                        throw httpError(500, 'data_corrupt');
                    }

                    const state = validateState(parsed);
                    sendJson(response, 200, {
                        version: state.version,
                        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
                        categories: state.categories,
                        prompts: state.prompts
                    });
                    return;
                }

                if (request.method === 'PUT') {
                    const text = await readBody(request);
                    let parsed;
                    try {
                        parsed = JSON.parse(text);
                    } catch (error) {
                        throw httpError(400, 'invalid_json');
                    }

                    const state = validateState(parsed);
                    const savedAt = new Date().toISOString();
                    const payload = JSON.stringify({
                        version: state.version,
                        savedAt,
                        categories: state.categories,
                        prompts: state.prompts
                    }, null, 2);

                    const directory = path.dirname(dataFile);
                    await mkdir(directory, { recursive: true });
                    const temporary = `${dataFile}.tmp-${process.pid}-${Date.now()}`;
                    await writeFile(temporary, payload, 'utf8');
                    if (existsSync(dataFile)) {
                        await copyFile(dataFile, `${dataFile}.bak`).catch(() => {});
                    }
                    await rename(temporary, dataFile);

                    sendJson(response, 200, { ok: true, savedAt });
                    return;
                }

                sendJson(response, 405, { error: 'method_not_allowed' });
                return;
            }

            sendJson(response, 404, { error: 'not_found' });
        } catch (error) {
            if (response.headersSent) {
                response.destroy();
                return;
            }
            const status = Number.isInteger(error.status) ? error.status : 500;
            sendJson(response, status, { error: error.message || 'server_error' });
        }
    });

    app.server = server;

    return app;
}

export async function startBackupServer(options = {}) {
    const app = createBackupServer(options);

    await new Promise((resolve, reject) => {
        app.server.once('error', reject);
        app.server.listen(options.port ?? 8765, app.host, resolve);
    });

    const address = app.server.address();
    app.port = address.port;
    app.url = `http://${app.host}:${app.port}/`;
    return app;
}

export function parseArgs(argv) {
    const options = {
        port: 8765,
        host: '127.0.0.1',
        dataFile: null,
        logFile: null,
        open: true,
        ensure: false,
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
            if (!Number.isInteger(value) || value < 0 || value > 65535) {
                throw new Error('--port erwartet eine Zahl zwischen 0 und 65535');
            }
            options.port = value;
        } else if (argument === '--host') {
            options.host = next();
        } else if (argument === '--data') {
            options.dataFile = next();
        } else if (argument === '--log') {
            options.logFile = next();
        } else if (argument === '--ensure') {
            options.ensure = true;
        } else if (argument === '--no-open') {
            options.open = false;
        } else if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unbekannte Option: ${argument}`);
        }
    }

    return options;
}

export function openBrowser(url) {
    const platform = process.platform;
    let command;
    let args;

    if (platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', '', url];
    } else if (platform === 'darwin') {
        command = 'open';
        args = [url];
    } else {
        command = 'xdg-open';
        args = [url];
    }

    try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore' });
        child.on('error', () => {});
        child.unref();
    } catch (error) {
        // Kein Browser-Autostart: URL wird ohnehin ausgegeben.
    }
}

function usage() {
    return [
        'Aufruf: node serve.mjs [Optionen]',
        '',
        '  --port <n>     Port (Standard 8765, 0 = automatisch)',
        '  --host <addr>  Bind-Adresse (Standard 127.0.0.1)',
        '  --data <datei> JSON-Datei (Standard prompt-manager-data.json neben serve.mjs)',
        '  --log <datei>  Startmeldungen in eine Protokolldatei schreiben',
        '  --ensure       Nur starten, wenn nicht schon eine Instanz läuft',
        '  --no-open      Browser nicht automatisch öffnen',
        '  --help         Diese Hilfe'
    ].join('\n');
}

function hostForUrl(host) {
    return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/**
 * Prüft, ob unter host:port bereits dieser Server antwortet.
 * Wird von --ensure genutzt, damit ein Lesezeichen/Shortcut keinen zweiten
 * Server startet und der vorhandene Datenbestand unangetastet bleibt.
 */
export async function probeServer({ host = '127.0.0.1', port, timeoutMs = 1500 } = {}) {
    if (!port) return { running: false, ours: false };
    const url = `http://${hostForUrl(host)}:${port}/api/health`;

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store'
        });
        if (!response.ok) return { running: true, ours: false, status: response.status };

        let health;
        try {
            health = await response.json();
        } catch (error) {
            // Etwas anderes antwortet auf dem Port, aber es ist nicht diese App.
            return { running: true, ours: false };
        }

        return { running: true, ours: health && health.app === APP_ID, health };
    } catch (error) {
        return { running: false, ours: false };
    }
}

function createLogger(logFile) {
    if (!logFile) return () => {};
    return (message) => {
        const line = `${new Date().toISOString()} ${message}\n`;
        void appendFile(logFile, line, 'utf8').catch(() => {});
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }

    const dataFile = options.dataFile
        ? path.resolve(options.dataFile)
        : path.join(ROOT, 'prompt-manager-data.json');
    const log = createLogger(options.logFile ? path.resolve(options.logFile) : null);
    const host = hostForUrl(options.host);
    const expectedUrl = `http://${host}:${options.port}/`;

    if (options.ensure && options.port !== 0) {
        const probe = await probeServer({ host: options.host, port: options.port });
        if (probe.ours) {
            log(`bereits aktiv auf Port ${options.port}`);
            console.log(`Prompt Manager läuft bereits: ${expectedUrl}`);
            if (options.open) openBrowser(expectedUrl);
            return;
        }
        if (probe.running) {
            log(`Port ${options.port} ist von einem anderen Programm belegt`);
            console.error(`Port ${options.port} ist von einem anderen Programm belegt. `
                + 'Nutze --port 8766 oder beende das andere Programm.');
            process.exitCode = 1;
            return;
        }
    }

    let app;
    try {
        app = await startBackupServer({
            port: options.port,
            host: options.host,
            dataFile
        });
    } catch (error) {
        if (error && error.code === 'EADDRINUSE') {
            log(`Port ${options.port} belegt (EADDRINUSE)`);
            console.error(`Port ${options.port} ist belegt. Nutze --port 8766 oder --port 0.`);
            process.exitCode = 1;
            return;
        }
        throw error;
    }

    if (app.host !== '127.0.0.1' && app.host !== 'localhost' && app.host !== '::1') {
        console.warn('Warnung: Der Server ist nicht nur lokal erreichbar.');
    }

    log(`gestartet auf ${app.url} (PID ${process.pid}), Daten: ${dataFile}`);
    console.log(`Prompt Manager: ${app.url}`);
    console.log(`Daten:         ${dataFile}`);
    if (options.logFile) console.log(`Protokoll:     ${path.resolve(options.logFile)}`);
    console.log('Beenden:       Strg+C');
    if (options.open) openBrowser(app.url);

    const shutdown = () => {
        log('beendet');
        app.server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`serve: ${error.message}`);
        process.exitCode = 1;
    });
}
