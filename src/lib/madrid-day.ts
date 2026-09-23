// madrid-day.ts — the calendar day the agency lives in, as UTC instants.
//
// "Today's visits" is a business question asked in Madrid, and the answer has
// to be the same whether the agent's laptop is in Madrid, Dubai or on a plane:
// the boundaries are computed in the agency's zone, never in the browser's.
//
// No fixed offsets. Spain is +1 in winter and +2 in summer and the switch days
// are 23 and 25 hours long; Intl knows all of that and this module asks it.
// PURE and dependency-free so `node --test` can check the DST edges.

export const MADRID_TZ = 'Europe/Madrid';

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

interface Civil { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** What a Madrid wall clock shows at `instant`. */
function civilOf(instant: Date): Civil {
  const out: Record<string, number> = {};
  for (const { type, value } of wallClock.formatToParts(instant)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  return out as unknown as Civil;
}

/** The same wall clock as a UTC timestamp, so two readings can be subtracted. */
const asUtc = (c: Civil) => Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);

/**
 * The instant at which the Madrid calendar day `year-month-day` begins.
 * `month` is 1–12; `day` may overflow the month (Date.UTC normalises it), which
 * is how "the next day" is spelled without a calendar of its own.
 *
 * First guess: midnight UTC of that date. Its Madrid wall clock is off by the
 * zone offset, and subtracting the difference lands on Madrid midnight — unless
 * a DST change sits between the guess and the answer, which one more pass
 * absorbs.
 */
export function madridMidnight(year: number, month: number, day: number): Date {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    guess -= asUtc(civilOf(new Date(guess))) - target;
  }
  return new Date(guess);
}

/** `[from, to)`: the UTC bounds of the Madrid calendar day that contains `now`. */
export function madridDayBounds(now: Date = new Date()): { from: Date; to: Date } {
  const { year, month, day } = civilOf(now);
  return { from: madridMidnight(year, month, day), to: madridMidnight(year, month, day + 1) };
}

/** PocketBase's datetime literal for filters: `YYYY-MM-DD HH:MM:SS.sssZ`. */
export const pbDateLiteral = (d: Date): string => d.toISOString().replace('T', ' ');

/** A PocketBase filter that keeps the rows whose `field` falls in today (Madrid). */
export function madridTodayFilter(field: string, now: Date = new Date()): string {
  const { from, to } = madridDayBounds(now);
  return `${field} >= "${pbDateLiteral(from)}" && ${field} < "${pbDateLiteral(to)}"`;
}
