import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadApp } from './harness.mjs';

const { api } = await loadApp();
const fixturePath = fileURLToPath(new URL('./fixtures/backup-2.1.json', import.meta.url));

test('Backup im Format 2.1 wird vollständig gelesen', async () => {
    const text = await readFile(fixturePath, 'utf8');
    const decoded = api.decodeBackup(text);

    assert.equal(decoded.ok, true);
    assert.equal(decoded.version, '2.1');
    assert.equal(decoded.categories.length, 2);
    assert.equal(decoded.prompts.length, 2);
    assert.equal(decoded.rejectedPrompts, 0);
    assert.equal(decoded.upgradedFrom, '2.1');
});

test('Export-Runde erhält Kategorien und Prompts', () => {
    api.setState({
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_a',
            title: 'Titel',
            category: 'coding',
            content: 'Inhalt',
            tags: ['x'],
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z'
        }]
    });

    const encoded = api.encodeBackup();
    const decoded = api.decodeBackup(encoded);

    assert.equal(decoded.ok, true);
    assert.equal(decoded.version, api.CONFIG.EXPORT_VERSION);
    assert.equal(JSON.stringify(decoded.categories), JSON.stringify(api.getState().categories));
    assert.equal(decoded.prompts.length, 1);
    assert.equal(decoded.prompts[0].content, 'Inhalt');
});

test('ungültiges JSON und fehlende Felder werden abgelehnt', () => {
    assert.equal(api.decodeBackup('{').ok, false);
    assert.equal(api.decodeBackup('').ok, false);
    assert.equal(api.validateImportedData(null).ok, false);
    assert.equal(api.validateImportedData({ prompts: [] }).ok, false);
    assert.equal(api.validateImportedData({ categories: [] }).ok, false);
    assert.equal(api.validateImportedData({ categories: [], prompts: {} }).ok, false);
});

test('neuere Export-Version wird abgelehnt', () => {
    const decoded = api.validateImportedData({
        version: '3.0',
        categories: [],
        prompts: []
    });
    assert.equal(decoded.ok, false);
    assert.match(decoded.errors[0], /Nicht unterstützte Export-Version/);
});

test('fehlende Versionsangabe bleibt kompatibel und wird markiert', () => {
    const decoded = api.validateImportedData({
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: []
    });
    assert.equal(decoded.ok, true);
    assert.equal(decoded.upgradedFrom, 'ohne Versionsangabe');
});

test('Inhalt wird auf das Maximum gekürzt und gemeldet', () => {
    const decoded = api.validateImportedData({
        version: '2.2',
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_long',
            title: 'Lang',
            category: 'coding',
            content: 'x'.repeat(api.CONFIG.MAX_CONTENT_LENGTH + 25),
            tags: []
        }]
    });

    assert.equal(decoded.ok, true);
    assert.equal(decoded.prompts[0].content.length, api.CONFIG.MAX_CONTENT_LENGTH);
    assert.equal(decoded.truncatedPrompts, 1);
    assert.ok(decoded.warnings.some((warning) => warning.includes('gekürzt')));
});

test('Titel wird gekürzt, ungültige Einträge werden gezählt', () => {
    const decoded = api.validateImportedData({
        version: '2.2',
        categories: [
            { id: 'coding', name: 'Programmierung', icon: '💻' },
            { id: 'ohne-name', icon: '📁' },
            null
        ],
        prompts: [
            {
                id: 'prompt_title',
                title: 'T'.repeat(api.CONFIG.MAX_TITLE_LENGTH + 10),
                category: 'coding',
                content: 'x',
                tags: []
            },
            { id: 'prompt_ohne_titel', category: 'coding', content: 'x' }
        ]
    });

    assert.equal(decoded.ok, true);
    assert.equal(decoded.prompts[0].title.length, api.CONFIG.MAX_TITLE_LENGTH);
    assert.equal(decoded.rejectedCategories, 2);
    assert.equal(decoded.rejectedPrompts, 1);
    assert.ok(decoded.warnings.some((warning) => warning.includes('ohne gültigen Titel')));
});

test('Tags werden normalisiert, dedupliziert und begrenzt', () => {
    const tags = [' Python ', 'python', '', 42, ...Array.from({ length: 30 }, (_, index) => `tag${index}`)];
    const normalized = api.normalizeTags(tags);

    assert.equal(normalized.length, api.CONFIG.MAX_TAGS);
    assert.equal(normalized[0], 'Python');
    assert.equal(normalized[1], '42');
    assert.equal(new Set(normalized.map((tag) => tag.toLowerCase())).size, normalized.length);
});

test('unsichere Kategorie-ID wird ersetzt und Prompts werden umgemappt', () => {
    const rawId = 'bad\' onclick=\'alert(1)';
    const decoded = api.validateImportedData({
        version: '2.2',
        categories: [{ id: rawId, name: 'Test', icon: '📁' }],
        prompts: [{
            id: 'prompt_1',
            title: 'Titel',
            category: rawId,
            content: 'x',
            tags: []
        }]
    });

    assert.equal(decoded.ok, true);
    const categoryId = decoded.categories[0].id;
    assert.match(categoryId, /^[A-Za-z0-9_-]{1,64}$/);
    assert.equal(decoded.prompts[0].category, categoryId);
});

test('unbekannte Kategorie landet in der ersten vorhandenen Kategorie', () => {
    const decoded = api.validateImportedData({
        version: '2.2',
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_1',
            title: 'Titel',
            category: 'gibt-es-nicht',
            content: 'x',
            tags: []
        }]
    });

    assert.equal(decoded.prompts[0].category, 'coding');
});

test('Import mischt statt zu überschreiben und erkennt Doppelungen', () => {
    api.setState({
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_a',
            title: 'Vorhanden',
            category: 'coding',
            content: 'Inhalt A',
            tags: [],
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z'
        }]
    });

    const stats = api.mergeImportedData(
        [
            { id: 'coding', name: 'Programmierung', icon: '💻' },
            { id: 'neu', name: 'Neue Kategorie', icon: '📁' }
        ],
        [
            { id: 'prompt_a', title: 'Vorhanden', category: 'coding', content: 'Inhalt A', tags: [] },
            { id: 'prompt_b', title: 'Vorhanden', category: 'coding', content: '  inhalt   a ', tags: [] },
            { id: 'prompt_c', title: 'Neu', category: 'neu', content: 'Inhalt B', tags: [] }
        ]
    );

    assert.equal(stats.categoriesAdded, 1);
    assert.equal(stats.promptsAdded, 1);
    assert.equal(stats.promptsSkipped, 2);
    assert.equal(api.getState().prompts.length, 2);
});

test('ID-Kollision mit anderem Inhalt verliert keine Daten', () => {
    api.setState({
        categories: [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        prompts: [{
            id: 'prompt_a',
            title: 'Alt',
            category: 'coding',
            content: 'Inhalt A',
            tags: [],
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z'
        }]
    });

    const stats = api.mergeImportedData(
        [{ id: 'coding', name: 'Programmierung', icon: '💻' }],
        [{ id: 'prompt_a', title: 'Anders', category: 'coding', content: 'Inhalt B', tags: [] }]
    );

    assert.equal(stats.promptsAdded, 1);
    assert.equal(stats.promptsReidentified, 1);
    assert.equal(api.getState().prompts.length, 2);
    assert.notEqual(api.getState().prompts[1].id, 'prompt_a');
});

test('zu große Importe werden vor dem Einlesen abgelehnt', () => {
    const decoded = api.validateImportedData({
        version: '2.2',
        categories: [],
        prompts: new Array(api.CONFIG.MAX_PROMPTS + 1).fill({})
    });

    assert.equal(decoded.ok, false);
    assert.match(decoded.errors[0], /Zu viele Prompts/);
});
