import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce, latest, view, type Page } from './list.mjs';

// The state every list screen keeps, kept once.
//
// `items` are the records the screen already has. Searching, sorting and paging
// happen in the browser: the fleet's collections are hundreds of rows, not
// millions, `listAll` already fetches whole collections, and a round trip per
// keystroke is slower and can answer out of order. `useRemoteList` below is for
// the day a collection outgrows that — and it carries the guard that makes an
// out-of-order answer harmless.

export interface UseList<T> extends Page<T> {
  query: string;
  setQuery(q: string): void;
  sort: string | undefined;
  dir: 'asc' | 'desc';
  /** Same key toggles the direction; a different key sorts ascending. */
  toggleSort(key: string): void;
  setPage(p: number): void;
  next(): void;
  prev(): void;
}

export function useList<T>(items: T[], opts: {
  fields?: string[];
  size?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  locale?: string;
} = {}): UseList<T> {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(opts.sort);
  const [dir, setDir] = useState<'asc' | 'desc'>(opts.dir ?? 'asc');
  const [page, setPage] = useState(1);

  // A search that shrinks the list must not leave the reader on page 7 of 2.
  // `paginate` clamps, so nothing breaks — but the number in the control would
  // disagree with the page being shown.
  useEffect(() => { setPage(1); }, [query, sort, dir]);

  const p = useMemo(
    () => view(items, { query, fields: opts.fields, sort, dir, page, size: opts.size, locale: opts.locale }),
    [items, query, sort, dir, page, opts.fields, opts.size, opts.locale],
  );

  return {
    ...p,
    query,
    setQuery,
    sort,
    dir,
    toggleSort: (key: string) => {
      // Plain reads of the current state, not a side effect inside a state
      // updater: React may call an updater twice, and the direction would flip
      // twice with it.
      if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
      else { setSort(key); setDir('asc'); }
    },
    setPage,
    next: () => setPage((n) => n + 1),
    prev: () => setPage((n) => Math.max(1, n - 1)),
  };
}

/**
 * The same screen when the server does the searching.
 *
 * The only hard part is the one every screen re-invents with a ref: typing
 * "mad" fires three requests, they may answer in any order, and the answer to
 * "ma" arriving last overwrites the results for "mad" with no error anywhere.
 * `latest()` makes the stale answer a no-op.
 */
export function useRemoteList<T>(fetcher: (query: string) => Promise<T[]>, opts: {
  minChars?: number;
  delay?: number;
} = {}) {
  const [query, setQuery] = useState('');
  // Bumped to re-ask the server for the same query — what a screen needs after
  // it creates, edits or deletes a row. Without it the first adopter kept its
  // own copy of the list beside this one, which is how the two disagree.
  const [nonce, setNonce] = useState(0);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fresh = useRef(latest()).current;
  const run = useRef(fetcher);
  run.current = fetcher;

  useEffect(() => {
    const minChars = opts.minChars ?? 2;
    const q = query.trim().length >= minChars ? query.trim() : '';
    const go = () => {
      const mine = fresh();
      setLoading(true);
      run.current(q)
        .then((rows) => { if (mine()) { setItems(rows); setError(null); } })
        .catch((e: Error) => { if (mine()) setError(e); })
        .finally(() => { if (mine()) setLoading(false); });
    };
    // The empty query is the full list and runs immediately; a typed one waits
    // for the typing to stop.
    if (!q) { go(); return; }
    const d = debounce(go, opts.delay ?? 300);
    d();
    return () => d.cancel();
  }, [query, nonce, opts.minChars, opts.delay]);

  return {
    items,
    loading,
    error,
    query,
    setQuery,
    /** Re-run the current query. The stale-answer guard still applies. */
    reload: () => setNonce((n) => n + 1),
  };
}
