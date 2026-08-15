// Priority, as the design draws it: three states, not five numbers.
//
// The `leads.prioridad` column stays a 1–5 number — no schema change, no data
// migration, and the finer score is still there if it is ever wanted back. This
// module is the whole of the mapping between the stored score and the three
// states the agent sees, and it is PURE so `node --test` can check it.

export type PriorityLevel = 'high' | 'medium' | 'low' | 'none';

/** The three states a dot can be set to, strongest first. `none` is not one of
 *  them: it is what you get by clearing, never by choosing. */
export const PRIORITY_LEVELS = ['high', 'medium', 'low'] as const satisfies readonly PriorityLevel[];

/** Stored score (1–5) -> state. 0, null and undefined all mean "not set":
 *  PocketBase returns 0 for an empty number field. */
export function levelOf(score?: number | null): PriorityLevel {
  if (score == null || !Number.isFinite(score) || score <= 0) return 'none';
  if (score >= 4) return 'high';
  if (score === 3) return 'medium';
  return 'low';
}

/** State -> the score written back. `none` writes null, which clears the field. */
export function scoreOf(level: PriorityLevel): number | null {
  if (level === 'high') return 5;
  if (level === 'medium') return 3;
  if (level === 'low') return 1;
  return null;
}

/** i18n key for a state — the label itself is never a literal in the UI. */
export const priorityLabelKey = (level: PriorityLevel) => `priority.${level}`;
