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
 * The instant at which a Madrid wall clock reads `year-month-day hour:minute`.
 * `month` is 1–12; `day` may overflow the month (Date.UTC normalises it), which
 * is how "the next day" is spelled without a calendar of its own.
 *
 * First guess: that wall clock read as UTC. Its Madrid wall clock is off by the
 * zone offset, and subtracting the difference lands on the Madrid reading —
 * unless a DST change sits between the guess and the answer, which one more
 * pass absorbs. A wall time that does not exist (02:30 on the spring-forward
 * night) resolves to the instant the clock actually showed next; an ambiguous
 * one (02:30 on the fall-back night) resolves to one of its two instants.
 */
export function madridInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    guess -= asUtc(civilOf(new Date(guess))) - target;
  }
  return new Date(guess);
}

/** The instant at which the Madrid calendar day `year-month-day` begins. */
export const madridMidnight = (year: number, month: number, day: number): Date =>
  madridInstant(year, month, day);

// -- the `datetime-local` bridge ------------------------------------------------
// A `<input type="datetime-local">` holds "YYYY-MM-DDTHH:MM" with no zone at
// all; the browser would happily read it in whatever zone the laptop is in.
// The visit form reads it as Madrid wall time and writes it back the same way,
// so an agent booking from Dubai and one booking from Madrid book the same
// instant when they type the same clock.

const two = (n: number) => String(n).padStart(2, '0');

/** The wall clock a `datetime-local` field should show for `instant`. */
export function madridWallOf(instant: Date): string {
  const c = civilOf(instant);
  return `${c.year}-${two(c.month)}-${two(c.day)}T${two(c.hour)}:${two(c.minute)}`;
}

/** The instant a `datetime-local` value names when read as Madrid wall time; null if malformed. */
export function instantOfMadridWall(wall: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return madridInstant(year, month, day, hour, minute);
}

/**
 * The next round half hour on the Madrid clock after `now`, as a
 * `datetime-local` value: the default of a new visit, so the field opens on a
 * time somebody could actually book rather than on 00:00.
 */
export function nextMadridSlot(now: Date = new Date(), stepMinutes = 30): string {
  const c = civilOf(now);
  const minute = Math.ceil((c.minute + 1) / stepMinutes) * stepMinutes;
  return madridWallOf(madridInstant(c.year, c.month, c.day, c.hour, minute));
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
