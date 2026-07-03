import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBrandMetrics, computeAllScores } from '../src/score.mjs';

/** Tiny fixture with exactly-computable numbers. */
const fixture = {
  meta: { capturedAt: '2026-07-01T00:00:00Z', period: '2026-W27' },
  brand: { name: 'Acme Roofing', aliases: ['Acme', 'ACME Co'], domain: 'acmeroofing.com' },
  competitors: [
    { name: 'Beta Roofing', aliases: ['Beta'], domain: 'betaroofing.com' },
    { name: 'Ghost Roofing', aliases: [], domain: 'ghostroofing.com' },
  ],
  surfaces: ['chatgpt', 'gemini'],
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
      // Brand appears under an alias, with different casing.
      entities: [{ name: 'acme co', mentioned: true, linked: false, position: 2, sentiment: 'neutral' }],
      citedSources: ['angi.com'],
    },
  ],
};

test('computeBrandMetrics: exact math on tiny fixture', () => {
  const m = computeBrandMetrics(fixture, 'Acme Roofing');
  // mentioned in 2/2 runs; linked in 1/2; positions 1 and 2; sentiments positive, neutral
  assert.equal(m.appearanceRate, 1);
  assert.equal(m.citationRate, 0.5);
  assert.equal(m.prominence, (1 + 1 / 2) / 2); // 0.75
  assert.equal(m.sentiment, (1 + 0.5) / 2); // 0.75
  // score = round(100 * (0.4*1 + 0.3*0.5 + 0.2*0.75 + 0.1*0.75)) = round(77.5) = 78
  assert.equal(m.score, 78);
});

test('computeBrandMetrics: competitor metrics', () => {
  const m = computeBrandMetrics(fixture, 'Beta Roofing');
  assert.equal(m.appearanceRate, 0.5);
  assert.equal(m.citationRate, 0);
  assert.equal(m.prominence, 0.5); // mean of 1/2 over 1 mentioned run
  assert.equal(m.sentiment, 0.5);
  // score = round(100 * (0.2 + 0 + 0.1 + 0.05)) = 35
  assert.equal(m.score, 35);
});

test('computeBrandMetrics: resolves aliases case-insensitively (query side too)', () => {
  const canonical = computeBrandMetrics(fixture, 'Acme Roofing');
  assert.deepEqual(computeBrandMetrics(fixture, 'acme'), canonical);
  assert.deepEqual(computeBrandMetrics(fixture, 'ACME CO'), canonical);
  assert.deepEqual(computeBrandMetrics(fixture, '  Acme  '), canonical);
});

test('computeBrandMetrics: never-mentioned entity gets neutral sentiment and zero rates', () => {
  const m = computeBrandMetrics(fixture, 'Ghost Roofing');
  assert.equal(m.appearanceRate, 0);
  assert.equal(m.citationRate, 0);
  assert.equal(m.prominence, 0);
  assert.equal(m.sentiment, 0.5); // default when never mentioned
  assert.equal(m.score, 5); // round(100 * 0.1 * 0.5)
});

test('computeBrandMetrics: empty results yields all zeros and score 0', () => {
  const empty = { ...fixture, results: [] };
  assert.deepEqual(computeBrandMetrics(empty, 'Acme Roofing'), {
    appearanceRate: 0,
    citationRate: 0,
    prominence: 0,
    sentiment: 0,
    score: 0,
  });
});

test('computeBrandMetrics: missing results array handled like empty', () => {
  const { results, ...noResults } = fixture;
  assert.equal(computeBrandMetrics(noResults, 'Acme Roofing').score, 0);
});

test('computeBrandMetrics: entities with mentioned=false are ignored', () => {
  const capture = {
    ...fixture,
    results: [
      {
        prompt: 'p',
        surface: 'chatgpt',
        entities: [{ name: 'Acme Roofing', mentioned: false, linked: true, position: 1, sentiment: 'positive' }],
        citedSources: [],
      },
    ],
  };
  const m = computeBrandMetrics(capture, 'Acme Roofing');
  assert.equal(m.appearanceRate, 0);
  assert.equal(m.citationRate, 0);
});

test('computeAllScores: returns brand first, then all competitors', () => {
  const all = computeAllScores(fixture);
  assert.deepEqual(
    all.map((e) => e.name),
    ['Acme Roofing', 'Beta Roofing', 'Ghost Roofing'],
  );
  assert.equal(all[0].score, 78);
  assert.equal(all[1].score, 35);
  assert.equal(all[2].score, 5);
});

test('score is clamped to 0..100', () => {
  const perfect = {
    brand: { name: 'A', aliases: [], domain: 'a.com' },
    competitors: [],
    surfaces: ['chatgpt'],
    results: [
      {
        prompt: 'p',
        surface: 'chatgpt',
        entities: [{ name: 'A', mentioned: true, linked: true, position: 1, sentiment: 'positive' }],
        citedSources: [],
      },
    ],
  };
  const m = computeBrandMetrics(perfect, 'A');
  assert.equal(m.score, 100);
});
