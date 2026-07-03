/**
 * Scoring engine for the AI Search Visibility Tracker.
 *
 * A "run" is one prompt x one surface (one element of capture.results).
 * All metrics are computed per entity (the brand or a competitor) across runs.
 *
 * Score formula (documented in the client report):
 *   score = round(100 * (0.4*appearanceRate + 0.3*citationRate + 0.2*prominence + 0.1*sentiment))
 * clamped to 0..100.
 */

export const SCORE_WEIGHTS = Object.freeze({
  appearanceRate: 0.4,
  citationRate: 0.3,
  prominence: 0.2,
  sentiment: 0.1,
});

const SENTIMENT_VALUES = Object.freeze({
  positive: 1,
  neutral: 0.5,
  negative: 0,
});

/** All names (canonical + aliases) for an entity, lowercased. */
function namesFor(entity) {
  const names = [entity?.name, ...(Array.isArray(entity?.aliases) ? entity.aliases : [])];
  return names.filter((n) => typeof n === 'string' && n.trim() !== '').map((n) => n.trim().toLowerCase());
}

/** All tracked entities in a capture: brand first, then competitors. */
export function trackedEntities(capture) {
  const entities = [];
  if (capture?.brand?.name) entities.push(capture.brand);
  for (const competitor of Array.isArray(capture?.competitors) ? capture.competitors : []) {
    if (competitor?.name) entities.push(competitor);
  }
  return entities;
}

/**
 * Resolve a name (case-insensitive, aliases included) to the tracked
 * entity definition in the capture. Returns null when unknown.
 */
export function resolveEntity(capture, name) {
  if (typeof name !== 'string' || name.trim() === '') return null;
  const target = name.trim().toLowerCase();
  return trackedEntities(capture).find((entity) => namesFor(entity).includes(target)) ?? null;
}

/** Does a result-level entity record refer to the given tracked entity? */
function refersTo(resultEntity, trackedEntity) {
  if (typeof resultEntity?.name !== 'string') return false;
  return namesFor(trackedEntity).includes(resultEntity.name.trim().toLowerCase());
}

/** Find the mentioned entity record for a tracked entity within one run. */
function mentionInRun(run, trackedEntity) {
  const entities = Array.isArray(run?.entities) ? run.entities : [];
  return entities.find((e) => e?.mentioned === true && refersTo(e, trackedEntity)) ?? null;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Compute visibility metrics for a single entity (brand or competitor).
 *
 * @param {object} capture - a capture document (see docs/capture-schema.md)
 * @param {string} brandName - entity name or alias, matched case-insensitively
 * @returns {{ appearanceRate: number, citationRate: number, prominence: number, sentiment: number, score: number }}
 *
 * Definitions:
 * - appearanceRate: mentioned runs / total runs
 * - citationRate:   runs where the entity is linked / total runs
 * - prominence:     mean over mentioned runs of 1/position; 0 if never mentioned
 * - sentiment:      mean over mentioned runs of positive=1 / neutral=0.5 / negative=0;
 *                   defaults to 0.5 (neutral) if never mentioned
 * An empty capture (no runs) yields all zeros and score 0.
 */
export function computeBrandMetrics(capture, brandName) {
  const results = Array.isArray(capture?.results) ? capture.results : [];
  const totalRuns = results.length;
  if (totalRuns === 0) {
    return { appearanceRate: 0, citationRate: 0, prominence: 0, sentiment: 0, score: 0 };
  }

  // Fall back to a bare entity so unknown names still score (as never-mentioned).
  const entity = resolveEntity(capture, brandName) ?? { name: brandName, aliases: [] };

  let mentionedRuns = 0;
  let linkedRuns = 0;
  let inversePositionSum = 0;
  let sentimentSum = 0;

  for (const run of results) {
    const mention = mentionInRun(run, entity);
    if (!mention) continue;
    mentionedRuns += 1;
    if (mention.linked === true) linkedRuns += 1;
    const position = Number(mention.position);
    if (Number.isFinite(position) && position >= 1) {
      inversePositionSum += 1 / position;
    }
    sentimentSum += SENTIMENT_VALUES[mention.sentiment] ?? SENTIMENT_VALUES.neutral;
  }

  const appearanceRate = mentionedRuns / totalRuns;
  const citationRate = linkedRuns / totalRuns;
  const prominence = mentionedRuns > 0 ? inversePositionSum / mentionedRuns : 0;
  const sentiment = mentionedRuns > 0 ? sentimentSum / mentionedRuns : 0.5;

  const raw =
    SCORE_WEIGHTS.appearanceRate * appearanceRate +
    SCORE_WEIGHTS.citationRate * citationRate +
    SCORE_WEIGHTS.prominence * prominence +
    SCORE_WEIGHTS.sentiment * sentiment;

  return {
    appearanceRate,
    citationRate,
    prominence,
    sentiment,
    score: clamp(Math.round(100 * raw), 0, 100),
  };
}

/**
 * Compute metrics for the brand and every competitor.
 * Returns an array (brand first) of { name, ...metrics }.
 */
export function computeAllScores(capture) {
  return trackedEntities(capture).map((entity) => ({
    name: entity.name,
    ...computeBrandMetrics(capture, entity.name),
  }));
}
