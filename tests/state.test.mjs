import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const { api } = await loadApp();

test('normalizeState repariert fehlende Tags und ungültige Zeitstempel', () => {
    const normalized = api.normalizeState(
        [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        [{
            id: 'prompt_a',
            title: 'Titel',
            category: 'coding',
            content: 'Inhalt',
            tags: 'kein-array',
            createdAt: 'kein-datum',
            updatedAt: null
        }]
    );

    assert.equal(normalized.prompts.length, 1);
    assert.deepEqual(Array.from(normalized.prompts[0].tags), []);
    assert.match(normalized.prompts[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(normalized.prompts[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(normalized.changed, true);
});

test('normalizeState setzt bei leerem Bestand Standardkategorien', () => {
    const normalized = api.normalizeState([], []);
    assert.equal(normalized.categories.length, api.CONFIG.DEFAULT_CATEGORIES.length);
    assert.equal(normalized.changed, true);
});

test('normalizeState erkennt doppelte Prompt-IDs und vergibt neue', () => {
    const normalized = api.normalizeState(
        [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        [
            { id: 'prompt_a', title: 'Eins', category: 'coding', content: 'A', tags: [] },
            { id: 'prompt_a', title: 'Zwei', category: 'coding', content: 'B', tags: [] }
        ]
    );

    assert.equal(normalized.prompts.length, 2);
    assert.notEqual(normalized.prompts[0].id, normalized.prompts[1].id);
});

test('Kategoriename wird getrimmt und begrenzt', () => {
    const normalized = api.normalizeState(
        [{ id: 'coding', name: `  ${'N'.repeat(80)}  `, icon: '💻' }],
        []
    );

    assert.equal(normalized.categories[0].name.length, api.CONFIG.MAX_CATEGORY_NAME_LENGTH);
});

test('Prompt lässt sich in eine andere Kategorie verschieben', () => {
    api.setState({
        categories: [
            { id: 'coding', name: 'Programmierung', icon: '💻' },
            { id: 'research', name: 'Forschung', icon: '🔬' }
        ],
        prompts: [{
            id: 'prompt_a',
            title: 'Titel',
            category: 'coding',
            content: 'Inhalt',
            tags: [],
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z'
        }]
    });

    const before = api.getState().prompts[0].updatedAt;
    const moved = api.movePromptToCategory('prompt_a', 'research');
    const prompt = api.getState().prompts[0];

    assert.equal(moved, true);
    assert.equal(prompt.category, 'research');
    assert.notEqual(prompt.updatedAt, before);
});

test('Verschieben in dieselbe oder eine unbekannte Kategorie ändert nichts', () => {
    api.setState({
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_a',
            title: 'Titel',
            category: 'coding',
            content: 'Inhalt',
            tags: [],
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z'
        }]
    });

    assert.equal(api.movePromptToCategory('prompt_a', 'coding'), false);
    assert.equal(api.movePromptToCategory('prompt_a', 'fehlt'), false);
    assert.equal(api.movePromptToCategory('fehlt', 'coding'), false);
    assert.equal(api.getState().prompts[0].category, 'coding');
});

test('createId erzeugt eindeutige, sichere IDs', () => {
    const ids = new Set();
    for (let index = 0; index < 200; index += 1) {
        const id = api.createId('prompt');
        assert.match(id, /^[A-Za-z0-9_-]{1,100}$/);
        assert.ok(!ids.has(id));
        ids.add(id);
    }
});

test('normalizeIsoDate fällt bei ungültigen Werten auf den Ersatzwert zurück', () => {
    assert.equal(api.normalizeIsoDate('kein-datum', '2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
    assert.equal(api.normalizeIsoDate('2026-02-03T04:05:06.000Z', '2026-01-01T00:00:00.000Z'), '2026-02-03T04:05:06.000Z');
});
