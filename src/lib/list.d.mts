// Types for list.mjs. They live here, and not in the module, so the logic can
// be run by `node --test` in a CI that installs nothing — this repo's Node has
// no TypeScript support, and a test that has to strip types by hand is a test
// that quietly stops testing.

/** A record with named fields, which is what every collection returns. It is
 *  NOT used as a generic constraint: an `interface Identity { email: string }`
 *  does not satisfy `Record<string, unknown>` (no index signature), so
 *  constraining on it would make every real row type an error at the call
 *  site — measured on the admin screen, eight of them. */
export type Row = Record<string, unknown>;
export type Direction = 'asc' | 'desc';

export interface Page<T> {
  /** The records of this page. */
  items: T[];
  /** The page actually shown, clamped into range. */
  page: number;
  pages: number;
  total: number;
  size: number;
  /** 1-based and inclusive, for "showing 21–40 of 65". 0 when empty. */
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface ViewOptions {
  query?: string;
  /** Which fields the search reads. Every value of the record when omitted. */
  fields?: string[];
  sort?: string;
  dir?: Direction;
  page?: number;
  size?: number;
  /** For `localeCompare`; the app's current locale. */
  locale?: string;
}

export declare function fold(value: unknown): string;
export declare function search<T>(items: T[], query: string, fields?: string[]): T[];
export declare function sortBy<T>(items: T[], key?: string, dir?: Direction, locale?: string): T[];
export declare function paginate<T>(items: T[], opts?: { page?: number; size?: number }): Page<T>;
export declare function view<T>(items: T[], opts?: ViewOptions): Page<T>;
/** Returns a factory: call it to claim a request, call its result to ask
 *  whether that request is still the newest. */
export declare function latest(): () => () => boolean;
export declare function debounce<A extends unknown[]>(
  fn: (...args: A) => void, ms?: number
): ((...args: A) => void) & { cancel(): void };
