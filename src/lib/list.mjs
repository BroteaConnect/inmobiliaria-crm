// list.mjs — searching, sorting and paging a list of records, and nothing else.
//
// Plain JavaScript with a `.d.mts` beside it, on purpose: this is the logic
// every list screen gets wrong, so it has to be testable by `node --test` in a
// CI that installs no dependencies. The types are in list.d.mts; the app
// imports `../lib/list.mjs` and gets both.
//
// What it does NOT do: fetch, render, or decide what a row looks like. The
// fleet's list screens are genuinely different from one another — a kanban, a
// grid of photos, a table of identities — and a component that tried to be all
// three would be configured until it was worse than the three. What they share
// is what happens between "here are the records" and "here is the screenful".

/**
 * Fold accents and case so a search for `mostoles` finds `Móstoles`.
 *
 * Spanish is one of the two required languages of every app: a search box that
 * only matches when the accent is typed is a search box that looks broken to
 * the people using it. `ñ` is deliberately NOT folded to `n` — it is a
 * different letter, and folding it makes `año` and `ano` the same word.
 */
export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    // Grave, acute, circumflex and diaeresis — written as escapes because a
    // combining mark typed literally is invisible in an editor and one of them
    // vanishing in a copy-paste would silently change what this matches.
    // U+0303 (the tilde) is NOT here: `ñ` is a letter, not an accented `n`.
    .replace(/[\u0300\u0301\u0302\u0308]/g, '')
    // Back to NFC: the decomposed `ñ` compares unequal to the `ñ` anyone types  lang-sweep: allow
    // in a source file or a test, and that mismatch is invisible on screen.
    .normalize('NFC')
    .toLowerCase();

const textOf = (item, fields) => {
  const source = fields?.length ? fields.map((f) => item?.[f]) : Object.values(item ?? {});
  return fold(source.filter((v) => v !== null && v !== undefined && typeof v !== 'object').join(' '));
};

/**
 * Every record whose text contains ALL the words typed, in any order.
 *
 * Word-by-word rather than substring, because "calle mayor 3" should find
 * "Calle Mayor, 3, Madrid" — a single-substring match finds nothing and the
 * person retypes their own query until they give up.
 */
export function search(items, query, fields) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const text = textOf(item, fields);
    return words.every((w) => text.includes(w));
  });
}

/**
 * Sort by one key, stably, with the empties last.
 *
 * Stable because a re-render must not reshuffle rows that compare equal, and
 * empties last because a blank cell sorting to the top pushes every row that
 * has an answer off the first screen. Numbers compare as numbers, dates as
 * dates, and text with `localeCompare` so `ñ` lands where a Spanish reader
 * expects it.
 */
export function sortBy(items, key, dir = 'asc', locale = 'es') {
  if (!key) return items;
  const sign = dir === 'desc' ? -1 : 1;
  const blank = (v) => v === null || v === undefined || v === '';
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const x = a.item?.[key];
      const y = b.item?.[key];
      if (blank(x) && blank(y)) return a.i - b.i;
      if (blank(x)) return 1;
      if (blank(y)) return -1;
      let cmp;
      if (typeof x === 'number' && typeof y === 'number') cmp = x - y;
      else if (typeof x === 'boolean' && typeof y === 'boolean') cmp = Number(x) - Number(y);
      else {
        const dx = Date.parse(x);
        const dy = Date.parse(y);
        const isDate = !Number.isNaN(dx) && !Number.isNaN(dy)
          && /^\d{4}-\d{2}-\d{2}/.test(String(x)) && /^\d{4}-\d{2}-\d{2}/.test(String(y));
        cmp = isDate ? dx - dy : String(x).localeCompare(String(y), locale, { numeric: true });
      }
      return cmp === 0 ? a.i - b.i : cmp * sign;
    })
    .map(({ item }) => item);
}

/**
 * One screenful, and everything the controls need to describe it.
 *
 * `page` is CLAMPED into range instead of trusted. A page number survives a
 * search that shrinks the list, and an out-of-range page renders an empty
 * screen with rows that exist — which reads as "there is nothing here" and is
 * how the estate agency's CRM hid 26 leads for weeks.
 *
 * `from`/`to` are 1-based and inclusive, because they exist to be read by a
 * human in "showing 21–40 of 65", not to slice an array.
 */
export function paginate(items, { page = 1, size = 20 } = {}) {
  const total = items.length;
  const perPage = Math.max(1, Math.floor(size) || 1);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    pages,
    total,
    size: perPage,
    from: total ? start + 1 : 0,
    to: Math.min(start + perPage, total),
    hasPrev: current > 1,
    hasNext: current < pages,
  };
}

/** Search, then sort, then page — in that order, which is the only one that
 *  gives "page 2 of the results" rather than "the results within page 2". */
export function view(items, { query = '', fields, sort, dir, page, size, locale } = {}) {
  return paginate(sortBy(search(items, query, fields), sort, dir, locale), { page, size });
}

/**
 * A guard for out-of-order responses: only the newest call may write.
 *
 * Typing "mad" fires three searches; the network may answer them in any order,
 * and the answer to "ma" arriving last overwrites the results for "mad" with
 * no error anywhere. Every screen that searches has re-invented this with a
 * ref, or has not and is quietly wrong.
 *
 *   const fresh = latest();
 *   const done = fresh();            // claims this call as the newest
 *   const rows = await fetchRows(q);
 *   if (done()) setRows(rows);       // false if another call started meanwhile
 */
export function latest() {
  let issued = 0;
  return () => {
    const mine = ++issued;
    return () => mine === issued;
  };
}

/** Call `fn` once the caller has stopped calling for `ms`. */
export function debounce(fn, ms = 300) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}
