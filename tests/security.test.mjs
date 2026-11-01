import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const { api } = await loadApp();

test('escapeHtml maskiert Anführungszeichen und spitze Klammern', () => {
    assert.equal(
        api.escapeHtml('a"b<c>&d\''),
        'a&quot;b&lt;c&gt;&amp;d&#39;'
    );
});

test('Bild-alt kann nicht aus dem Attribut ausbrechen', () => {
    const html = api.renderInline(
        '![x" onerror="alert(1)](data:image/png;base64,iVBORw0KGgo=)'
    );

    assert.match(html, /^<img /);
    assert.ok(html.includes('alt="x&quot; onerror=&quot;alert(1)"'));
    assert.ok(!html.includes('alt="x" onerror='));
});

test('externe Bilder werden nicht geladen, sondern verlinkt', () => {
    const html = api.renderMarkdown('![Alt](https://example.invalid/b.png)');
    assert.doesNotMatch(html, /<img[^>]+https:/);
    assert.match(html, /\(extern, nicht geladen\)/);
    assert.match(html, /href="https:\/\/example\.invalid\/b\.png"/);
});

test('javascript:-Links werden blockiert', () => {
    const html = api.renderInline('[klick](javascript:alert(1))');
    assert.doesNotMatch(html, /href=/);
    assert.match(html, /Link blockiert/);
});

test('weitere aktive Schemata werden blockiert', () => {
    for (const url of [
        'data:text/html;base64,PHNjcmlwdD4=',
        'vbscript:msgbox(1)',
        'file:///C:/Windows/System32/calc.exe',
        '//example.invalid/x',
        '\\\\\\\\example.invalid/x',
        'JaVaScRiPt:alert(1)'
    ]) {
        const html = api.renderInline(`[x](${url})`);
        assert.doesNotMatch(html, /href=/, `Schema nicht blockiert: ${url}`);
    }
});

test('http(s), mailto und relative Links bleiben erlaubt', () => {
    assert.match(api.renderInline('[a](https://example.invalid/x)'), /href="https:\/\/example\.invalid\/x"/);
    assert.match(api.renderInline('[a](mailto:test@example.invalid)'), /href="mailto:test@example\.invalid"/);
    assert.match(api.renderInline('[a](./docs/readme.md)'), /href="\.\/docs\/readme\.md"/);
    assert.match(api.renderInline('[a](#abschnitt)'), /href="#abschnitt"/);
});

test('Anführungszeichen und spitze Klammern sind in URLs nicht erlaubt', () => {
    assert.equal(api.sanitizeUrl('https://example.invalid/"onerror="'), null);
    assert.equal(api.sanitizeUrl("https://example.invalid/'onerror='"), null);
    assert.equal(api.sanitizeUrl('https://example.invalid/<script>'), null);
});

test('nur eingebettete Rasterbilder werden als img gerendert', () => {
    assert.match(
        api.renderInline('![x](data:image/png;base64,iVBORw0KGgo=)'),
        /^<img src="data:image\/png;base64,/
    );
    assert.doesNotMatch(
        api.renderInline('![x](data:image/svg+xml;base64,PHN2Zz4=)'),
        /<img/
    );
    assert.match(api.renderInline('![x](data:image/svg+xml;base64,PHN2Zz4=)'), /Bild blockiert/);
});

test('Inline-Code im Bild-Alt landet nicht im Attribut', () => {
    const html = api.renderInline('![a `b`](data:image/png;base64,iVBORw0KGgo=)');
    assert.match(html, /alt="a "/);
    assert.doesNotMatch(html, /<code>/);
});

test('relative Bilder werden nicht geladen', () => {
    const html = api.renderInline('![lokal](./bild.png)');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /\(nicht geladen\)/);
});

test('Inline-Code bleibt literal, Emphase wirkt nicht darin', () => {
    assert.equal(api.renderInline('`a**b**c`'), '<code>a**b**c</code>');
});

test('Markdown escapt HTML und hält Tabellen escaped', () => {
    const html = api.renderMarkdown('<script>alert(1)</script>');
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);

    const table = api.renderMarkdown('| A | B |\n| --- | --- |\n| 1 \\| 2 | <b>x</b> |');
    assert.match(table, /<td>1 \| 2<\/td>/);
    assert.match(table, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('Autolinks erzeugen sichere href-Attribute', () => {
    const html = api.renderInline('Siehe https://example.invalid/pfad?q=1');
    assert.match(html, /href="https:\/\/example\.invalid\/pfad\?q=1"/);
    assert.match(html, /rel="noopener noreferrer"/);
});
