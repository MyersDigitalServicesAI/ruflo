/**
 * Share-of-voice, snapshot comparison, and alerting for the
 * AI Search Visibility Tracker.
 */

import { computeAllScores, resolveEntity, trackedEntities } from './score.mjs';

/** All names (canonical + aliases) for an entity, lowercased. */
function namesFor(entity) {
  const names = [entity?.name, ...(Array.isArray(entity?.aliases) ? entity.aliases : [])];
  return names.filter((n) => typeof n === 'string' && n.trim() !== '').map((n) => n.trim().toLowerCase());
}

/**
 * Share of voice per tracked entity.
 * @returns Array of { name, appearances, totalRuns, sov } (brand first).
 * sov = appearances / totalRuns (0 when there are no runs).
 */
export function shareOfVoice(capture) {
  const results = Array.isArray(capture?.results) ? capture.results : [];
  const totalRuns = results.length;

  return trackedEntities(capture).map((entity) => {
    const names = namesFor(entity);
    let appearances = 0;
    for (const run of results) {
      const entities = Array.isArray(run?.entities) ? run.entities : [];
      const mentioned = entities.some(
        (e) => e?.mentioned === true && typeof e.name === 'string' && names.includes(e.name.trim().toLowerCase()),
      );
      if (mentioned) appearances += 1;
    }
    return {
      name: entity.name,
      appearances,
      totalRuns,
      sov: totalRuns > 0 ? appearances / totalRuns : 0,
    };
  });
}

/** Distinct cited sources in a capture whose URL/host contains the brand domain. */
function brandCitingSources(capture) {
  const domain = String(capture?.brand?.domain ?? '').trim().toLowerCase();
  const sources = new Set();
  if (domain === '') return sources;
  for (const run of Array.isArray(capture?.results) ? capture.results : []) {
    for (const source of Array.isArray(run?.citedSources) ? run.citedSources : []) {
      if (typeof source === 'string' && source.toLowerCase().includes(domain)) {
        sources.add(source);
      }
    }
  }
  return sources;
}

/**
 * Compare two capture snapshots (same brand/competitor set expected).
 *
 * @returns {{
 *   brand: string,
 *   scoreDeltas: Array<{ name, previous, current, delta }>,
 *   overtakes: Array<{ by: string, over: string }>,
 *   lostCitations: string[],
 *   newCitingSources: string[],
 * }}
 *
 * - overtakes: a competitor whose SoV was <= the brand's in the previous
 *   snapshot and is > the brand's in the current snapshot.
 * - lostCitations: cited sources containing the brand domain that were
 *   present in the previous snapshot but are absent in the current one.
 * - newCitingSources: sources containing the brand domain newly citing
 *   in the current snapshot.
 */
export function compareSnapshots(previousCapture, currentCapture) {
  const brandName = currentCapture?.brand?.name ?? null;

  const previousScores = computeAllScores(previousCapture);
  const currentScores = computeAllScores(currentCapture);

  const scoreDeltas = currentScores.map((current) => {
    const previous = previousScores.find(
      (p) => resolveEntity(previousCapture, current.name)?.name === p.name || p.name === current.name,
    );
    return {
      name: current.name,
      previous: previous ? previous.score : null,
      current: current.score,
      delta: previous ? current.score - previous.score : null,
    };
  });

  // Overtake detection on share of voice.
  const previousSov = shareOfVoice(previousCapture);
  const currentSov = shareOfVoice(currentCapture);
  const sovByName = (list, name) => list.find((e) => e.name === name)?.sov ?? null;

  const overtakes = [];
  const brandPrevSov = sovByName(previousSov, brandName);
  const brandCurrentSov = sovByName(currentSov, brandName);
  if (brandName !== null && brandPrevSov !== null && brandCurrentSov !== null) {
    for (const competitor of Array.isArray(currentCapture?.competitors) ? currentCapture.competitors : []) {
      const prevSov = sovByName(previousSov, competitor?.name);
      const currentSovValue = sovByName(currentSov, competitor?.name);
      if (prevSov === null || currentSovValue === null) continue;
      if (prevSov <= brandPrevSov && currentSovValue > brandCurrentSov) {
        overtakes.push({ by: competitor.name, over: brandName });
      }
    }
  }

  // Citation churn for sources carrying the brand domain.
  const previousSources = brandCitingSources(previousCapture);
  const currentSources = brandCitingSources(currentCapture);
  const lostCitations = [...previousSources].filter((s) => !currentSources.has(s)).sort();
  const newCitingSources = [...currentSources].filter((s) => !previousSources.has(s)).sort();

  return { brand: brandName, scoreDeltas, overtakes, lostCitations, newCitingSources };
}

/**
 * Turn a compareSnapshots() result into client-facing alerts.
 *
 * @param {object} comparison - output of compareSnapshots()
 * @param {{ scoreDeltaThreshold?: number }} [options]
 * @returns Array<{ severity: 'high'|'info', type: string, message: string }>
 */
export function buildAlerts(comparison, { scoreDeltaThreshold = 10 } = {}) {
  const alerts = [];
  if (!comparison || typeof comparison !== 'object') return alerts;

  const brandDelta = (comparison.scoreDeltas ?? []).find((d) => d.name === comparison.brand);
  if (brandDelta && typeof brandDelta.delta === 'number') {
    if (brandDelta.delta <= -scoreDeltaThreshold) {
      alerts.push({
        severity: 'high',
        type: 'score-drop',
        message: `${comparison.brand} visibility score dropped ${Math.abs(brandDelta.delta)} points (${brandDelta.previous} -> ${brandDelta.current}).`,
      });
    } else if (brandDelta.delta >= scoreDeltaThreshold) {
      alerts.push({
        severity: 'info',
        type: 'score-gain',
        message: `${comparison.brand} visibility score gained ${brandDelta.delta} points (${brandDelta.previous} -> ${brandDelta.current}).`,
      });
    }
  }

  for (const overtake of comparison.overtakes ?? []) {
    alerts.push({
      severity: 'high',
      type: 'overtake',
      message: `${overtake.by} overtook ${overtake.over} in share of voice across AI answers.`,
    });
  }

  for (const source of comparison.lostCitations ?? []) {
    alerts.push({
      severity: 'high',
      type: 'lost-citation',
      message: `AI answers stopped citing brand source "${source}".`,
    });
  }

  for (const source of comparison.newCitingSources ?? []) {
    alerts.push({
      severity: 'info',
      type: 'new-citing-source',
      message: `AI answers started citing brand source "${source}".`,
    });
  }

  return alerts;
}
