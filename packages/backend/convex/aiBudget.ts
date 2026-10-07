// Pure rules for the daily AI neuron budget: no Convex, no clock reads.

/** Workers AI free tier is 10,000 neurons a day; 10% margin below it. */
export const DEFAULT_DAILY_NEURON_LIMIT = 9000;

/** `AI_DAILY_NEURON_LIMIT` env value to a usable limit; anything unusable is the default. */
export function parseDailyLimit(raw: string | undefined) {
  const value = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_DAILY_NEURON_LIMIT;
}

/** The UTC day a timestamp falls in, "YYYY-MM-DD". Workers AI resets at 00:00 UTC. */
export function utcDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The next 00:00 UTC strictly after `ms`. */
export function nextResetAt(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
