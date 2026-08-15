// Adapter selection, kept pure so `node --test` can check it.
//
// Two things go wrong here in production and both are handled the same way, by
// falling back to the mock rather than to nothing:
//   · the settings row holds a value nobody recognises (an older or newer
//     version of the app wrote it, or someone edited the row by hand);
//   · the adapter that was asked for is not built yet and its factory returns
//     null.
// A screen that gets `null` back has to decide what to do with it at every call
// site, and one of those call sites will forget.
import type { AdapterKind, Port } from './types';

export const ADAPTER_KINDS: readonly AdapterKind[] = ['mock', 'live'];

/** Anything that is not exactly 'live' is the mock. Unknown never means live. */
export const coerceAdapterKind = (value: unknown): AdapterKind =>
  (value === 'live' ? 'live' : 'mock');

/** Is this port's adapter actually built? */
export const isAdapterBuilt = <Api,>(port: Port<Api>, kind: AdapterKind): boolean =>
  port.adapters[kind]?.() != null;

/** True when the port has no adapter at all — declared, but nothing behind it. */
export const isPortAvailable = <Api,>(port: Port<Api>): boolean =>
  ADAPTER_KINDS.some((kind) => isAdapterBuilt(port, kind));

/**
 * The adapter a screen actually gets, and — just as important — which one it
 * turned out to be, so the UI can say so.
 */
export function adapterFor<Api>(port: Port<Api>, wanted: unknown): { kind: AdapterKind; api: Api | null } {
  const kind = coerceAdapterKind(wanted);
  const api = port.adapters[kind]?.() ?? null;
  if (api) return { kind, api };
  const fallback = port.adapters.mock?.() ?? null;
  return { kind: 'mock', api: fallback };
}
