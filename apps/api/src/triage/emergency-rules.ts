/**
 * Emergency rules — plain keyword checks, no AI. They run before the AI call (on what the tenant
 * wrote) and again after it (also on what the AI wrote). A match always means EMERGENCY.
 * They err on the side of caution: a false alarm costs a phone call, a miss can cost a life.
 */
import type { EmergencyRuleId } from '@leaselens/shared';

export interface HeatingSeason {
  /** "MM-DD", inclusive. */
  start: string;
  /** "MM-DD", inclusive. */
  end: string;
}

/** DC requires heat from Oct 1 to May 1 (68°F day / 65°F night). Configurable via env. */
export const DC_HEATING_SEASON: HeatingSeason = { start: '10-01', end: '05-01' };

export function heatingSeasonFromEnv(env: NodeJS.ProcessEnv = process.env): HeatingSeason {
  const valid = (v?: string) => (v && /^\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    start: valid(env.HEATING_SEASON_START) ?? DC_HEATING_SEASON.start,
    end: valid(env.HEATING_SEASON_END) ?? DC_HEATING_SEASON.end,
  };
}

/** Is `date` (in Washington, DC time) inside the heating season? Handles seasons that wrap the new year. */
export function inHeatingSeason(date: Date, season: HeatingSeason = DC_HEATING_SEASON): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const today = `${parts.month}-${parts.day}`;
  return season.start <= season.end
    ? today >= season.start && today <= season.end
    : today >= season.start || today <= season.end;
}

interface Rule {
  id: EmergencyRuleId;
  test: (text: string, ctx: { now: Date; season: HeatingSeason }) => boolean;
}

const LOCKED_OUT = /\b(locked\s+out|lock\s*out|can'?t\s+get\s+(back\s+)?in(side)?|cannot\s+get\s+(back\s+)?in(side)?)\b/i;
const VULNERABLE =
  /\b(baby|babies|infant|newborn|child|children|kid|kids|toddler|elderly|grand(ma|pa|mother|father)|medication|medicine|insulin|oxygen|medical|disabled|disability|wheelchair|pregnant)\b/i;

/** Order = priority when several match. */
const RULES: Rule[] = [
  {
    id: 'gas-smell',
    test: (t) =>
      /\b(smell(s|ing|ed)?\s+(of\s+|like\s+)?(natural\s+)?gas|gas\s+(smell|odou?r|leak\w*)|leak\w*\s+gas|rotten\s+eggs?)\b/i.test(t),
  },
  {
    id: 'smoke-fire',
    // "smoke detector beeping" or "fire extinguisher" alone are not fires.
    test: (t) =>
      /\b(on\s+fire|flames?|fire\b(?!\s*(alarm|extinguisher|place|escape|door|exit))|smoke\b(?!\s*(detector|alarm)))/i.test(t),
  },
  {
    id: 'active-leak-ceiling',
    test: (t) =>
      // "through the ceiling", "through the bathroom ceiling", "from my kitchen ceiling"
      /\b(water|leak\w*|drip\w*|pour\w*)\b[^.!?]{0,40}\b(through|from|out\s+of|in)\s+(the\s+|my\s+)?([a-z]+\s+){0,2}ceiling\b/i.test(t) ||
      /\bceiling\b[^.!?]{0,30}\b(leak\w*|drip\w*|pour\w*|gush\w*)/i.test(t),
  },
  {
    id: 'flooding',
    test: (t) =>
      /\b(flood\w*|burst\s+pipe|pipe\s+(has\s+)?burst|water\s+(is\s+)?(pouring|gushing|spraying|everywhere))\b/i.test(t),
  },
  {
    id: 'sparking-burning',
    test: (t) =>
      /\b(spark\w*|burning\s+smell|smell\w*\s+(of\s+|like\s+)?(something\s+)?burning|(outlet|switch|panel|plug)\b[^.!?]{0,30}\b(melt\w*|scorch\w*|smok\w*|too\s+hot\s+to\s+touch))/i.test(t),
  },
  {
    id: 'no-heat-cold',
    test: (t, { now, season }) =>
      inHeatingSeason(now, season) &&
      /\b(no\s+heat|heat(er|ing)?\s+(is\s+)?(not|isn'?t|doesn'?t|does\s+not|won'?t|stopped)\s*(work\w*|on|turn\w*)?|heat(er|ing)?\s+(is\s+)?(broken|out|off|dead))\b/i.test(t),
  },
  {
    id: 'lockout-vulnerable',
    test: (t) => LOCKED_OUT.test(t) && VULNERABLE.test(t),
  },
];

/**
 * The first matching emergency rule for these texts, or null. Each text is checked on its own,
 * so words from two different texts (e.g. "ceiling" in one, "drips" in another) can't combine.
 */
export function matchEmergencyRule(
  texts: (string | null | undefined)[],
  now: Date = new Date(),
  season: HeatingSeason = DC_HEATING_SEASON,
): EmergencyRuleId | null {
  const list = texts.filter((t): t is string => !!t);
  return RULES.find((r) => list.some((text) => r.test(text, { now, season })))?.id ?? null;
}
