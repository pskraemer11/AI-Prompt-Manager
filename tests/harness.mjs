// Lädt das Inline-Skript aus prompt-manager.html in eine kontrollierte
// Node-VM. Kein Browser, keine Abhängigkeiten: Die Anwendung wird dadurch
// mit echten Funktionen getestet, nicht mit einer Kopie des Codes.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HTML_PATH = fileURLToPath(new URL('../prompt-manager.html', import.meta.url));

function createElementStub() {
    return {
        style: {},
        classList: {
            add() {},
            remove() {},
            contains() { return false; }
        },
        dataset: {},
        children: [],
        hidden: false,
        textContent: '',
        innerHTML: '',
        value: '',
        offsetParent: null,
        setAttribute() {},
        getAttribute() { return null; },
        removeAttribute() {},
        appendChild() {},
        append() {},
        remove() {},
        focus() {},
        blur() {},
        select() {},
        click() {},
        closest() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {}
    };
}

export function createSandbox() {
    const storage = new Map();
    const localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        },
        removeItem(key) {
            storage.delete(key);
        },
        clear() {
            storage.clear();
        },
        key(index) {
            return Array.from(storage.keys())[index] ?? null;
        },
        get length() {
            return storage.size;
        }
    };

    const documentStub = {
        activeElement: null,
        body: createElementStub(),
        addEventListener() {},
        removeEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        createElement() { return createElementStub(); },
        createDocumentFragment() { return createElementStub(); },
        contains() { return false; },
        execCommand() { return false; }
    };

    const sandbox = {
        console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
        document: documentStub,
        localStorage,
        sessionStorage: localStorage,
        navigator: { clipboard: { writeText: async () => {} } },
        crypto: globalThis.crypto,
        URL,
        Blob,
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        requestAnimationFrame: () => 0,
        confirm: () => true,
        alert: () => {},
        addEventListener() {},
        removeEventListener() {}
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    return sandbox;
}

export async function loadApp() {
    const html = await readFile(HTML_PATH, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Inline-Skript fehlt in prompt-manager.html');

    const sandbox = createSandbox();
    const context = vm.createContext(sandbox);
    vm.runInContext(match[1], context, { filename: 'prompt-manager.inline.js' });

    if (!sandbox.PromptManager) {
        throw new Error('window.PromptManager wurde nicht gesetzt');
    }

    return { api: sandbox.PromptManager, sandbox, html };
}
