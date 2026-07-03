import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shareOfVoice, compareSnapshots, buildAlerts } from '../src/sov.mjs';

const brand = { name: 'Acme Roofing', aliases: ['Acme'], domain: 'acmeroofing.com' };
const competitors = [{ name: 'Beta Roofing', aliases: ['Beta'], domain: 'betaroofing.com' }];

function run(entities, citedSources = []) {
  return { prompt: 'best roofing company', surface: 'chatgpt', entities, citedSources };
}

function mention(name, overrides = {}) {
  return { name, mentioned: true, linked: false, position: 1, sentiment: 'neutral', ...overrides };
}

function capture(results, period = '2026-W27') {
  return { meta: { capturedAt: '2026-07-01T00:00:00Z', period }, brand, competitors, surfaces: ['chatgpt'], results };
}

test('shareOfVoice: counts appearances per entity, aliases included', () => {
  const c = capture([
    run([mention('Acme Roofing'), mention('Beta Roofing', { position: 2 })]),
    run([mention('acme')]), // alias, lowercased
    run([mention('Beta', { position: 1 })]),
    run([]),
  ]);
  const sov = shareOfVoice(c);
  assert.deepEqual(sov, [
    { name: 'Acme Roofing', appearances: 2, totalRuns: 4, sov: 0.5 },
    { name: 'Beta Roofing', appearances: 2, totalRuns: 4, sov: 0.5 },
  ]);
});

test('shareOfVoice: empty capture yields sov 0', () => {
  const sov = shareOfVoice(capture([]));
  assert.deepEqual(sov, [
    { name: 'Acme Roofing', appearances: 0, totalRuns: 0, sov: 0 },
    { name: 'Beta Roofing', appearances: 0, totalRuns: 0, sov: 0 },
  ]);
});

test('shareOfVoice: sov values are appearances/totalRuns and never exceed 1', () => {
  const c = capture([run([mention('Acme Roofing')]), run([mention('Acme')])]);
  for (const entity of shareOfVoice(c)) {
    assert.equal(entity.sov, entity.appearances / entity.totalRuns);
    assert.ok(entity.sov >= 0 && entity.sov <= 1);
  }
});

test('compareSnapshots: score deltas, overtake, and citation churn', () => {
  // Previous: brand mentioned 2/2 runs, Beta 1/2. Brand-domain source cited.
  const prev = capture(
    [
      run([mention('Acme Roofing', { linked: true, sentiment: 'positive' })], ['acmeroofing.com/reviews', 'yelp.com']),
      run([mention('Acme Roofing'), mention('Beta Roofing', { position: 2 })], ['acmeroofing.com/reviews']),
    ],
    '2026-W26',
  );
  // Current: brand mentioned 0/2 runs, Beta 2/2 — Beta overtakes; brand source gone, new one appears.
  const cur = capture(
    [
      run([mention('Beta Roofing', { linked: true })], ['yelp.com']),
      run([mention('Beta Roofing')], ['blog.acmeroofing.com']),
    ],
    '2026-W27',
  );

  const comparison = compareSnapshots(prev, cur);
  assert.equal(comparison.brand, 'Acme Roofing');

  const brandDelta = comparison.scoreDeltas.find((d) => d.name === 'Acme Roofing');
  assert.ok(brandDelta.previous > brandDelta.current);
  assert.equal(brandDelta.delta, brandDelta.current - brandDelta.previous);
  assert.ok(brandDelta.delta < 0);

  assert.deepEqual(comparison.overtakes, [{ by: 'Beta Roofing', over: 'Acme Roofing' }]);
  assert.deepEqual(comparison.lostCitations, ['acmeroofing.com/reviews']);
  assert.deepEqual(comparison.newCitingSources, ['blog.acmeroofing.com']);
});

test('compareSnapshots: no overtake when competitor was already ahead', () => {
  const prev = capture([run([mention('Beta Roofing')]), run([])], '2026-W26');
  const cur = capture([run([mention('Beta Roofing')]), run([])], '2026-W27');
  const comparison = compareSnapshots(prev, cur);
  assert.deepEqual(comparison.overtakes, []); // Beta > brand in BOTH snapshots — not a new overtake
});

test('compareSnapshots: no changes yields empty churn lists', () => {
  const snap = capture([run([mention('Acme Roofing')], ['acmeroofing.com'])]);
  const comparison = compareSnapshots(snap, snap);
  assert.deepEqual(comparison.overtakes, []);
  assert.deepEqual(comparison.lostCitations, []);
  assert.deepEqual(comparison.newCitingSources, []);
  assert.equal(comparison.scoreDeltas.find((d) => d.name === 'Acme Roofing').delta, 0);
});

test('buildAlerts: default threshold of 10 points', () => {
  const base = { brand: 'Acme Roofing', scoreDeltas: [], overtakes: [], lostCitations: [], newCitingSources: [] };

  const drop10 = buildAlerts({ ...base, scoreDeltas: [{ name: 'Acme Roofing', previous: 70, current: 60, delta: -10 }] });
  assert.equal(drop10.length, 1);
  assert.equal(drop10[0].severity, 'high');
  assert.equal(drop10[0].type, 'score-drop');

  const drop9 = buildAlerts({ ...base, scoreDeltas: [{ name: 'Acme Roofing', previous: 70, current: 61, delta: -9 }] });
  assert.deepEqual(drop9, []); // below threshold — no alert

  const gain12 = buildAlerts({ ...base, scoreDeltas: [{ name: 'Acme Roofing', previous: 50, current: 62, delta: 12 }] });
  assert.equal(gain12.length, 1);
  assert.equal(gain12[0].severity, 'info');
  assert.equal(gain12[0].type, 'score-gain');
});

test('buildAlerts: custom scoreDeltaThreshold', () => {
  const comparison = {
    brand: 'Acme Roofing',
    scoreDeltas: [{ name: 'Acme Roofing', previous: 70, current: 65, delta: -5 }],
    overtakes: [],
    lostCitations: [],
    newCitingSources: [],
  };
  assert.equal(buildAlerts(comparison).length, 0);
  assert.equal(buildAlerts(comparison, { scoreDeltaThreshold: 5 }).length, 1);
});

test('buildAlerts: overtakes and citation churn map to typed alerts', () => {
  const alerts = buildAlerts({
    brand: 'Acme Roofing',
    scoreDeltas: [{ name: 'Acme Roofing', previous: 70, current: 68, delta: -2 }],
    overtakes: [{ by: 'Beta Roofing', over: 'Acme Roofing' }],
    lostCitations: ['acmeroofing.com/reviews'],
    newCitingSources: ['blog.acmeroofing.com'],
  });
  assert.deepEqual(
    alerts.map((a) => [a.type, a.severity]),
    [
      ['overtake', 'high'],
      ['lost-citation', 'high'],
      ['new-citing-source', 'info'],
    ],
  );
  assert.match(alerts[0].message, /Beta Roofing/);
  assert.match(alerts[1].message, /acmeroofing\.com\/reviews/);
});

test('sample data: demo conditions hold (delta > 10, overtake, lost citation)', async () => {
  const { readFile } = await import('node:fs/promises');
  const dir = new URL('../data/', import.meta.url);
  const prev = JSON.parse(await readFile(new URL('sample-capture-previous.json', dir), 'utf8'));
  const cur = JSON.parse(await readFile(new URL('sample-capture.json', dir), 'utf8'));

  assert.equal(cur.results.length, 48); // 12 prompts x 4 surfaces
  const comparison = compareSnapshots(prev, cur);
  const brandDelta = comparison.scoreDeltas.find((d) => d.name === cur.brand.name);
  assert.ok(Math.abs(brandDelta.delta) > 10, `expected |delta| > 10, got ${brandDelta.delta}`);
  assert.ok(comparison.overtakes.length >= 1, 'expected at least one overtake');
  assert.ok(comparison.lostCitations.length >= 1, 'expected at least one lost citation');
  assert.ok(buildAlerts(comparison).some((a) => a.severity === 'high'));
});
