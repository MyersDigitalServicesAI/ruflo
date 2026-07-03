#!/usr/bin/env node
/**
 * CLI: generate a white-label AI visibility report from a capture file.
 *
 * Usage:
 *   node bin/generate-report.mjs --input data/sample-capture.json \
 *     [--previous file.json] [--agency "Name"] [--accent "#hex"] [--out report.html]
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { generateReport } from '../src/report.mjs';
import { computeBrandMetrics } from '../src/score.mjs';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readCapture(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`could not read ${label} file "${path}": ${error.message}`);
  }
  let capture;
  try {
    capture = JSON.parse(raw);
  } catch (error) {
    fail(`${label} file "${path}" is not valid JSON: ${error.message}`);
  }
  validateCapture(capture, `${label} file "${path}"`);
  return capture;
}

function validateCapture(capture, label) {
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)) {
    fail(`${label} must be a JSON object (see docs/capture-schema.md)`);
  }
  if (typeof capture.brand?.name !== 'string' || capture.brand.name.trim() === '') {
    fail(`${label} is missing "brand.name" (see docs/capture-schema.md)`);
  }
  if (!Array.isArray(capture.results) || capture.results.length === 0) {
    fail(`${label} has no "results" — capture at least one prompt x surface run`);
  }
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      input: { type: 'string' },
      previous: { type: 'string' },
      agency: { type: 'string' },
      accent: { type: 'string' },
      out: { type: 'string' },
    },
  }));
} catch (error) {
  fail(error.message);
}

if (!values.input) {
  fail('missing required --input <capture.json>');
}

const current = readCapture(resolve(values.input), 'input');
const previous = values.previous ? readCapture(resolve(values.previous), 'previous') : null;

const html = generateReport({
  current,
  previous,
  whiteLabel: {
    agencyName: values.agency,
    accentColor: values.accent,
  },
});

const outPath = resolve(values.out ?? 'report.html');
try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
} catch (error) {
  fail(`could not write report to "${outPath}": ${error.message}`);
}

const brandName = current.brand.name;
const metrics = computeBrandMetrics(current, brandName);
const pct = (v) => `${Math.round(v * 1000) / 10}%`;

console.log(`Report written to ${outPath}`);
console.log(
  `${brandName}: score ${metrics.score}/100 ` +
    `(appearance ${pct(metrics.appearanceRate)}, citation ${pct(metrics.citationRate)}, ` +
    `prominence ${metrics.prominence.toFixed(2)}, sentiment ${metrics.sentiment.toFixed(2)})`,
);
