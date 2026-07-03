import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateReport, escapeHtml } from '../src/report.mjs';
import { computeBrandMetrics } from '../src/score.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const binPath = join(appRoot, 'bin', 'generate-report.mjs');
const samplePath = join(appRoot, 'data', 'sample-capture.json');
const previousPath = join(appRoot, 'data', 'sample-capture-previous.json');

function smallCapture(overrides = {}) {
  return {
    meta: { capturedAt: '2026-07-01T00:00:00Z', period: '2026-W27' },
    brand: { name: 'Acme Roofing', aliases: ['Acme'], domain: 'acmeroofing.com' },
    competitors: [{ name: 'Beta Roofing', aliases: [], domain: 'betaroofing.com' }],
    surfaces: ['chatgpt', 'google-ai', 'perplexity', 'gemini'],
    results: [
      {
        prompt: 'best roofing company in Austin',
        surface: 'chatgpt',
        entities: [
          { name: 'Acme Roofing', mentioned: true, linked: true, position: 1, sentiment: 'positive' },
          { name: 'Beta Roofing', mentioned: true, linked: false, position: 2, sentiment: 'neutral' },
        ],
        citedSources: ['yelp.com', 'acmeroofing.com'],
      },
      {
        prompt: 'best roofing company in Austin',
        surface: 'gemini',
        entities: [{ name: 'Acme', mentioned: true, linked: false, position: 1, sentiment: 'neutral' }],
        citedSources: ['angi.com', 'yelp.com'],
      },
    ],
    ...overrides,
  };
}

test('generateReport: contains score, agency name, footer, and methodology footnote', () => {
  const current = smallCapture();
  const html = generateReport({ current, whiteLabel: { agencyName: 'Demo Agency' } });
  const { score } = computeBrandMetrics(current, 'Acme Roofing');

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes(`<span class="value">${score}</span>`), 'shows the visibility score');
  assert.ok(html.includes('Demo Agency'), 'shows agency branding');
  assert.ok(html.includes('Prepared by Demo Agency'), 'footer');
  assert.ok(
    html.includes('0.4&times;appearance + 0.3&times;citation + 0.2&times;prominence + 0.1&times;sentiment'),
    'methodology footnote',
  );
  // Sections present, no external assets.
  for (const heading of ['Visibility Score', 'Score Components', 'Share of Voice', 'Appearance by Surface', 'Top Cited Sources']) {
    assert.ok(html.includes(heading), `section "${heading}"`);
  }
  assert.ok(!/\b(src|href)\s*=\s*["']https?:/.test(html), 'no external assets');
});

test('generateReport: escapes <script> in brand name and other user strings', () => {
  const current = smallCapture({
    brand: { name: '<script>alert(1)</script>', aliases: [], domain: 'acmeroofing.com' },
  });
  current.results[0].entities[0].name = '<script>alert(1)</script>';
  const html = generateReport({ current, whiteLabel: { agencyName: '<img src=x onerror=alert(2)>' } });

  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must not survive');
  assert.ok(!html.includes('<img src=x'), 'raw injected tag must not survive');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'brand name is escaped, not dropped');
});

test('generateReport: invalid accent color falls back to default, valid hex is used', () => {
  const withBad = generateReport({ current: smallCapture(), whiteLabel: { accentColor: 'red;} body{display:none' } });
  assert.ok(withBad.includes('--accent: #1a56db;'));
  const withGood = generateReport({ current: smallCapture(), whiteLabel: { accentColor: '#ff0000' } });
  assert.ok(withGood.includes('--accent: #ff0000;'));
});

test('generateReport: alerts section only when previous provided', () => {
  const current = smallCapture();
  const without = generateReport({ current });
  assert.ok(!without.includes('<h2>Alerts</h2>'));

  const previous = smallCapture({ meta: { capturedAt: '2026-06-24T00:00:00Z', period: '2026-W26' } });
  const withPrev = generateReport({ current, previous });
  assert.ok(withPrev.includes('<h2>Alerts</h2>'));
  assert.ok(withPrev.includes('2026-W26'), 'delta chip references previous period');
});

test('generateReport: per-surface grid marks mentioned vs absent surfaces', () => {
  const html = generateReport({ current: smallCapture() });
  // Mentioned on chatgpt + gemini, absent on google-ai + perplexity.
  assert.equal((html.match(/class="yes">&#10003;/g) ?? []).length >= 2, true);
  assert.equal((html.match(/class="no">&#10007;/g) ?? []).length, 2);
});

test('escapeHtml covers the critical characters', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
});

test('CLI smoke test: generates a report from the sample data', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ai-visibility-'));
  const outFile = join(outDir, 'report.html');
  const result = spawnSync(
    process.execPath,
    [binPath, '--input', samplePath, '--previous', previousPath, '--agency', 'Demo Agency', '--out', outFile],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(outFile), 'report file written');
  assert.match(result.stdout, /Report written to /);
  assert.match(result.stdout, /Summit Roofing Co: score \d+\/100/);

  const html = readFileSync(outFile, 'utf8');
  assert.ok(html.includes('Demo Agency'));
  assert.ok(html.includes('Summit Roofing Co'));
  assert.ok(html.includes('<h2>Alerts</h2>'));
});

test('CLI: exits non-zero with a clear message on missing input flag', () => {
  const result = spawnSync(process.execPath, [binPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--input/);
});

test('CLI: exits non-zero on capture with empty results', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ai-visibility-'));
  const badPath = join(outDir, 'empty.json');
  writeFileSync(
    badPath,
    JSON.stringify({ meta: {}, brand: { name: 'X', aliases: [], domain: 'x.com' }, competitors: [], surfaces: [], results: [] }),
  );
  const result = spawnSync(process.execPath, [binPath, '--input', badPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /results/i);
});

test('CLI: exits non-zero on capture missing brand', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ai-visibility-'));
  const badPath = join(outDir, 'no-brand.json');
  writeFileSync(badPath, JSON.stringify({ meta: {}, competitors: [], surfaces: [], results: [{}] }));
  const result = spawnSync(process.execPath, [binPath, '--input', badPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /brand/i);
});

test('CLI: exits non-zero on invalid JSON', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ai-visibility-'));
  const badPath = join(outDir, 'broken.json');
  writeFileSync(badPath, '{ not json');
  const result = spawnSync(process.execPath, [binPath, '--input', badPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JSON/i);
});
