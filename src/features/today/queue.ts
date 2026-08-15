// The day's action queue, derived and nothing else.
//
// PURE on purpose: no React, no fetch, no clock of its own. Everything it needs
// arrives as an argument, which is what lets `node --test` check it and what
// keeps the ordering rules readable in one place instead of spread through a
// screen.
//
// The design draws four buckets. Three of them are derivable from data this CRM
// already holds; the fourth — "booking without a contract" — has nothing behind
// it, no `visits` collection and no contract field, so it is dropped rather
// than faked. A queue that invents work is worse than a short queue.
import type { Actividad, Lead } from '../../crm/api';

export type QueueBucket = 'newUnanswered' | 'draftReady' | 'stale';

/** Bucket order IS the priority order of the day. */
export const BUCKETS: readonly QueueBucket[] = ['newUnanswered', 'draftReady', 'stale'];

/**
 * Two days without contact is the business rule, the same one `desatendido()`
 * in src/crm/api.ts applies to the board. It is repeated here rather than
 * imported because api.ts reaches PocketBase and this module must not.
 */
export const STALE_MS = 2 * 86400000;

/** Stages that are not waiting on anybody: closed, or parked on purpose. */
const CLOSED_STAGES = ['vendido', 'nutriendo'];

export interface QueueItem {
  lead: Lead;
  bucket: QueueBucket;
  /** What the wait is measured from — an ISO timestamp, oldest first. */
  since: string;
  /** The inbound message that put this lead in `draftReady`, when there is one. */
  trigger?: Actividad;
}

export interface QueueInput {
  leads: readonly Lead[];
  /** Recent activities, any direction. Missing ones only empty a bucket. */
  activities?: readonly Actividad[];
  /** Lead ids the agent waved away today (client-local, see Today.tsx). */
  dismissed?: readonly string[];
  now?: number;
}

/** PocketBase sends "2026-08-15 09:14:00Z"; Date wants the T. */
const at = (iso?: string): number =>
  (iso ? new Date(iso.replace(' ', 'T')).getTime() : Number.NaN);

/** The newest inbound activity per lead — "the client wrote and we have not answered". */
function latestInbound(activities: readonly Actividad[]): Map<string, Actividad> {
  const out = new Map<string, Actividad>();
  for (const a of activities) {
    if (a.direccion !== 'entrante') continue;
    const seen = out.get(a.lead);
    if (!seen || at(a.created) > at(seen.created)) out.set(a.lead, a);
  }
  return out;
}

/**
 * Which bucket a lead belongs in, or null when it needs nothing today.
 * First match wins, so a lead is in exactly one bucket.
 */
function classify(
  lead: Lead,
  inbound: Actividad | undefined,
  now: number,
): { bucket: QueueBucket; since: string; trigger?: Actividad } | null {
  if (CLOSED_STAGES.includes(lead.etapa)) return null;

  const contacted = at(lead.ultimo_contacto);

  // 1. Came in and nobody has answered it. The most expensive lead to lose.
  if (lead.etapa === 'nuevo' && !lead.ultimo_contacto) {
    return { bucket: 'newUnanswered', since: lead.created };
  }

  // 2. The client wrote after our last contact — a reply is owed, and a draft
  //    is exactly what shortens the gap.
  if (inbound && (Number.isNaN(contacted) || at(inbound.created) > contacted)) {
    return { bucket: 'draftReady', since: inbound.created, trigger: inbound };
  }

  // 3. Nobody has touched this lead in two days.
  if (!lead.ultimo_contacto || now - contacted > STALE_MS) {
    return { bucket: 'stale', since: lead.ultimo_contacto || lead.created };
  }

  return null;
}

/**
 * Ordering: bucket first, then the agent's own triage (a lead she marked as
 * high priority outranks one she did not), then the longest wait.
 */
const byUrgency = (a: QueueItem, b: QueueItem): number =>
  BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket)
  || (b.lead.prioridad ?? 0) - (a.lead.prioridad ?? 0)
  || String(a.since).localeCompare(String(b.since));

export function buildQueue({ leads, activities = [], dismissed = [], now = Date.now() }: QueueInput): QueueItem[] {
  const inbound = latestInbound(activities);
  const skip = new Set(dismissed);
  const items: QueueItem[] = [];
  for (const lead of leads) {
    if (skip.has(lead.id)) continue;
    const hit = classify(lead, inbound.get(lead.id), now);
    if (hit) items.push({ lead, ...hit });
  }
  return items.sort(byUrgency);
}

export interface TodaySummary {
  /** Every lead the board holds. */
  total: number;
  /** How many actions are actually queued right now. */
  pending: number;
  /** Leads past the two-day rule, whether or not they are in the queue. */
  unattended: number;
  /** Leads that arrived in the last seven days. */
  newThisWeek: number;
}

/**
 * Every number on the Today screen, computed from the rows in front of us.
 * There is no other source: the design's illustrative "312 / 986" and
 * "-38% no-shows" are not things this CRM can know, so it does not print them.
 */
export function summarize(
  leads: readonly Lead[],
  queue: readonly QueueItem[],
  now: number = Date.now(),
): TodaySummary {
  const week = 7 * 86400000;
  return {
    total: leads.length,
    pending: queue.length,
    unattended: leads.filter((l) =>
      !CLOSED_STAGES.includes(l.etapa)
      && (!l.ultimo_contacto || now - at(l.ultimo_contacto) > STALE_MS)).length,
    newThisWeek: leads.filter((l) => now - at(l.created) <= week).length,
  };
}
