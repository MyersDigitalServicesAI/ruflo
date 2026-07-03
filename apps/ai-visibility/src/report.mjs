/**
 * White-label HTML report generator for the AI Search Visibility Tracker.
 *
 * generateReport() returns a complete, standalone HTML document:
 * inline CSS only, no external assets, print-friendly for PDF export.
 */

import { computeBrandMetrics, computeAllScores, SCORE_WEIGHTS } from './score.mjs';
import { shareOfVoice, compareSnapshots, buildAlerts } from './sov.mjs';

/** Escape a value for safe interpolation into HTML text/attributes. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DEFAULT_ACCENT = '#1a56db';

/** Only allow hex colors so whiteLabel input cannot inject CSS. */
function safeAccent(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : DEFAULT_ACCENT;
}

/** Only allow data:image/ URIs so whiteLabel input cannot inject scripts. */
function safeLogo(logoDataUri) {
  return typeof logoDataUri === 'string' && /^data:image\//.test(logoDataUri) ? logoDataUri : null;
}

const pct = (value) => `${Math.round(value * 1000) / 10}%`;
const num = (value) => (Math.round(value * 100) / 100).toFixed(2);

function verdictFor(score) {
  if (score >= 80) return 'Dominant AI visibility — the brand leads the conversation.';
  if (score >= 60) return 'Strong AI visibility with room to consolidate the lead.';
  if (score >= 40) return 'Moderate AI visibility — the brand appears, but competitors share the stage.';
  if (score >= 20) return 'Weak AI visibility — the brand is often absent from AI answers.';
  return 'Critical: the brand is essentially invisible in AI answers.';
}

function surfacesOf(capture) {
  if (Array.isArray(capture?.surfaces) && capture.surfaces.length > 0) return capture.surfaces;
  const seen = [];
  for (const run of Array.isArray(capture?.results) ? capture.results : []) {
    if (typeof run?.surface === 'string' && !seen.includes(run.surface)) seen.push(run.surface);
  }
  return seen;
}

function brandMentionedOnSurface(capture, surface) {
  const metricsPerSurface = {
    ...capture,
    results: (Array.isArray(capture?.results) ? capture.results : []).filter((r) => r?.surface === surface),
  };
  return computeBrandMetrics(metricsPerSurface, capture?.brand?.name).appearanceRate > 0;
}

function topCitedSources(capture, limit = 8) {
  const counts = new Map();
  for (const run of Array.isArray(capture?.results) ? capture.results : []) {
    for (const source of Array.isArray(run?.citedSources) ? run.citedSources : []) {
      if (typeof source !== 'string' || source.trim() === '') continue;
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  const domain = String(capture?.brand?.domain ?? '').trim().toLowerCase();
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([source, citations]) => ({
      source,
      citations,
      isBrand: domain !== '' && source.toLowerCase().includes(domain),
    }));
}

/**
 * Generate the client-ready HTML report.
 *
 * @param {{ current: object, previous?: object|null, whiteLabel?: { agencyName?: string, accentColor?: string, logoDataUri?: string|null } }} params
 * @returns {string} standalone HTML document
 */
export function generateReport({ current, previous = null, whiteLabel = {} }) {
  if (!current || typeof current !== 'object') {
    throw new TypeError('generateReport: "current" capture is required');
  }

  const agencyName = typeof whiteLabel.agencyName === 'string' && whiteLabel.agencyName.trim() !== ''
    ? whiteLabel.agencyName.trim()
    : 'Your Agency';
  const accent = safeAccent(whiteLabel.accentColor);
  const logo = safeLogo(whiteLabel.logoDataUri);

  const brandName = current?.brand?.name ?? 'Unknown brand';
  const period = current?.meta?.period ?? '';
  const metrics = computeBrandMetrics(current, brandName);
  const verdict = verdictFor(metrics.score);

  // Week-over-week delta + alerts (only when a previous snapshot is supplied).
  let deltaChip = '';
  let alertsSection = '';
  if (previous) {
    const comparison = compareSnapshots(previous, current);
    const brandDelta = comparison.scoreDeltas.find((d) => d.name === comparison.brand);
    if (brandDelta && typeof brandDelta.delta === 'number') {
      const sign = brandDelta.delta > 0 ? '+' : '';
      const cls = brandDelta.delta > 0 ? 'up' : brandDelta.delta < 0 ? 'down' : 'flat';
      deltaChip = `<span class="delta ${cls}">${sign}${brandDelta.delta} vs ${escapeHtml(previous?.meta?.period ?? 'previous period')}</span>`;
    }
    const alerts = buildAlerts(comparison);
    const items = alerts.length === 0
      ? '<li class="alert info"><span class="badge">INFO</span> No alerts this period.</li>'
      : alerts
          .map(
            (a) =>
              `<li class="alert ${a.severity === 'high' ? 'high' : 'info'}"><span class="badge">${a.severity === 'high' ? 'HIGH' : 'INFO'}</span> ${escapeHtml(a.message)}</li>`,
          )
          .join('\n        ');
    alertsSection = `
    <section>
      <h2>Alerts</h2>
      <ul class="alerts">
        ${items}
      </ul>
    </section>`;
  }

  // Score component breakdown.
  const components = [
    { label: 'Appearance rate', weight: SCORE_WEIGHTS.appearanceRate, value: metrics.appearanceRate, display: pct(metrics.appearanceRate) },
    { label: 'Citation rate', weight: SCORE_WEIGHTS.citationRate, value: metrics.citationRate, display: pct(metrics.citationRate) },
    { label: 'Prominence', weight: SCORE_WEIGHTS.prominence, value: metrics.prominence, display: num(metrics.prominence) },
    { label: 'Sentiment', weight: SCORE_WEIGHTS.sentiment, value: metrics.sentiment, display: num(metrics.sentiment) },
  ];
  const breakdownRows = components
    .map(
      (c) =>
        `<tr><td>${c.label}</td><td>${Math.round(c.weight * 100)}%</td><td>${c.display}</td><td>${num(100 * c.weight * c.value)} pts</td></tr>`,
    )
    .join('\n          ');

  // Share of voice bars.
  const sov = [...shareOfVoice(current)].sort((a, b) => b.sov - a.sov);
  const sovRows = sov
    .map((entity) => {
      const isBrand = entity.name === brandName;
      const width = Math.max(0, Math.min(100, Math.round(entity.sov * 100)));
      return `<div class="sov-row${isBrand ? ' brand' : ''}">
          <div class="sov-label">${escapeHtml(entity.name)}${isBrand ? ' <span class="you">(you)</span>' : ''}</div>
          <div class="sov-track"><div class="sov-bar" style="width:${width}%"></div></div>
          <div class="sov-value">${pct(entity.sov)}</div>
        </div>`;
    })
    .join('\n        ');

  // Per-surface appearance grid.
  const surfaces = surfacesOf(current);
  const surfaceHeader = surfaces.map((s) => `<th>${escapeHtml(s)}</th>`).join('');
  const surfaceCells = surfaces
    .map((s) => (brandMentionedOnSurface(current, s) ? '<td class="yes">&#10003;</td>' : '<td class="no">&#10007;</td>'))
    .join('');

  // Top cited sources.
  const sources = topCitedSources(current);
  const sourceRows = sources.length === 0
    ? '<tr><td colspan="3">No cited sources captured this period.</td></tr>'
    : sources
        .map(
          (s) =>
            `<tr><td>${escapeHtml(s.source)}</td><td>${s.citations}</td><td>${s.isBrand ? '<span class="yes">&#10003; brand source</span>' : '&mdash;'}</td></tr>`,
        )
        .join('\n          ');

  const logoHtml = logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="${escapeHtml(agencyName)} logo">` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Search Visibility Report &mdash; ${escapeHtml(brandName)}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background: #f3f4f6; }
  .page { max-width: 860px; margin: 0 auto; padding: 32px 24px 48px; background: #ffffff; }
  header { border-bottom: 4px solid var(--accent); padding-bottom: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px; }
  header .logo { height: 48px; width: auto; }
  header .agency { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 4px 0 0; font-size: 24px; }
  header .subject { color: #4b5563; font-size: 14px; margin-top: 4px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; border-left: 4px solid var(--accent); padding-left: 8px; }
  .hero { display: flex; align-items: center; gap: 24px; }
  .score-circle { flex: 0 0 auto; width: 120px; height: 120px; border-radius: 50%; border: 6px solid var(--accent); display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .score-circle .value { font-size: 40px; font-weight: 700; color: var(--accent); line-height: 1; }
  .score-circle .of { font-size: 12px; color: #6b7280; }
  .verdict { font-size: 16px; }
  .delta { display: inline-block; margin-top: 8px; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .delta.up { background: #def7ec; color: #046c4e; }
  .delta.down { background: #fde8e8; color: #c81e1e; }
  .delta.flat { background: #e5e7eb; color: #374151; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; font-weight: 600; }
  .footnote { font-size: 12px; color: #6b7280; margin-top: 8px; }
  .sov-row { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  .sov-label { flex: 0 0 220px; font-size: 14px; }
  .sov-row.brand .sov-label { font-weight: 700; }
  .sov-row .you { color: var(--accent); font-weight: 600; font-size: 12px; }
  .sov-track { flex: 1 1 auto; background: #e5e7eb; border-radius: 6px; height: 18px; overflow: hidden; }
  .sov-bar { height: 100%; background: #9ca3af; border-radius: 6px; }
  .sov-row.brand .sov-bar { background: var(--accent); }
  .sov-value { flex: 0 0 60px; text-align: right; font-size: 13px; color: #4b5563; }
  td.yes, .yes { color: #046c4e; font-weight: 700; }
  td.no { color: #c81e1e; font-weight: 700; }
  .surface-grid td, .surface-grid th { text-align: center; }
  .surface-grid td:first-child, .surface-grid th:first-child { text-align: left; }
  ul.alerts { list-style: none; padding: 0; margin: 0; }
  li.alert { padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 14px; }
  li.alert.high { background: #fde8e8; }
  li.alert.info { background: #e1effe; }
  li.alert .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; margin-right: 8px; background: #ffffff; }
  li.alert.high .badge { color: #c81e1e; }
  li.alert.info .badge { color: #1e429f; }
  footer { border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 13px; color: #6b7280; }
  @media print {
    body { background: #ffffff; }
    .page { max-width: none; padding: 0; }
    section { break-inside: avoid; }
    li.alert, .delta, .sov-bar, .score-circle { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    ${logoHtml}
    <div>
      <div class="agency">${escapeHtml(agencyName)}</div>
      <h1>AI Search Visibility Report</h1>
      <div class="subject">${escapeHtml(brandName)}${period ? ` &middot; ${escapeHtml(period)}` : ''}</div>
    </div>
  </header>

  <section>
    <h2>Visibility Score</h2>
    <div class="hero">
      <div class="score-circle"><span class="value">${metrics.score}</span><span class="of">/ 100</span></div>
      <div>
        <div class="verdict">${escapeHtml(verdict)}</div>
        ${deltaChip}
      </div>
    </div>
  </section>

  <section>
    <h2>Score Components</h2>
    <table>
      <thead><tr><th>Factor</th><th>Weight</th><th>Value</th><th>Contribution</th></tr></thead>
      <tbody>
          ${breakdownRows}
      </tbody>
    </table>
    <p class="footnote">Score = 0.4&times;appearance + 0.3&times;citation + 0.2&times;prominence + 0.1&times;sentiment</p>
  </section>

  <section>
    <h2>Share of Voice</h2>
        ${sovRows}
    <p class="footnote">Share of AI answers (prompt &times; surface runs) in which each company is mentioned.</p>
  </section>

  <section>
    <h2>Appearance by Surface</h2>
    <table class="surface-grid">
      <thead><tr><th>Brand</th>${surfaceHeader}</tr></thead>
      <tbody><tr><td>${escapeHtml(brandName)}</td>${surfaceCells}</tr></tbody>
    </table>
  </section>

  <section>
    <h2>Top Cited Sources</h2>
    <table>
      <thead><tr><th>Source</th><th>Citations</th><th>Brand-owned?</th></tr></thead>
      <tbody>
          ${sourceRows}
      </tbody>
    </table>
  </section>
${alertsSection}
  <footer>Prepared by ${escapeHtml(agencyName)}</footer>
</div>
</body>
</html>
`;
}
