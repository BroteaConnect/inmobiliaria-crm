import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast as Rx } from 'radix-ui';
import { useI18n } from '../../lib/LocaleContext';
import { IconClose } from './icons';
import './ui.css';

// Feedback that does not belong to a place on the page: "email sent",
// "could not save". It appears at the trailing bottom corner, is announced to a
// screen reader, can be swiped away and leaves by itself.
//
// Two tones next to the neutral one, and only two: `ok` and `error`. A toast
// is not a status bar; if a screen needs a third colour it needs a component.
//
// A toast can be replaced and dismissed by id, because feedback must not
// stack or go stale: a search that fails on every keystroke shows ONE error,
// and "preparing photos" is gone the moment "saved" arrives.
//
// Mount <UiProvider> once, at the root; call `useToast()` anywhere below it.

export type ToastTone = 'info' | 'ok' | 'error';
export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Errors stay longer by default. */
  duration?: number;
  /** A stable id replaces the toast that carries it instead of adding one. */
  id?: string;
};
type Item = Omit<ToastInput, 'id'> & { id: string; open: boolean; rev: number };

export type Toast = ((toast: ToastInput) => string) & { dismiss: (id: string) => void };

const noop: Toast = Object.assign(() => '', { dismiss: () => {} });
const Ctx = createContext<Toast>(noop);

/** `const toast = useToast(); const id = toast({ title, tone: 'ok' }); toast.dismiss(id)`. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  // One removal timer per id. A toast re-issued while its predecessor is
  // leaving cancels that removal, or the new one would be torn down mid-life.
  const removals = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Closing flips `open` so the exit animation runs; the row is dropped from
  // state a moment later, whatever the animation did (reduced motion included).
  const dismiss = useCallback((id: string) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, open: false } : i)));
    clearTimeout(removals.current.get(id));
    removals.current.set(id, setTimeout(() => {
      removals.current.delete(id);
      setItems((list) => list.filter((i) => i.id !== id));
    }, 1000));
  }, []);
  const toast = useMemo<Toast>(() => Object.assign((input: ToastInput) => {
    const id = input.id ?? `t${++seq.current}`;
    clearTimeout(removals.current.get(id));
    removals.current.delete(id);
    setItems((list) => {
      const prev = list.find((i) => i.id === id);
      // A new revision remounts the root, so a replacement restarts its countdown.
      const next: Item = { ...input, id, open: true, rev: (prev?.rev ?? 0) + 1 };
      return prev ? list.map((i) => (i.id === id ? next : i)) : [...list, next];
    });
    return id;
  }, { dismiss }), [dismiss]);

  return (
    <Ctx.Provider value={toast}>
      <Rx.Provider label={t('ui.notifications')} swipeDirection="right">
        {children}
        {items.map((i) => (
          <Rx.Root
            key={`${i.id}-${i.rev}`}
            className="ui-toast"
            data-tone={i.tone ?? 'info'}
            open={i.open}
            onOpenChange={(open) => { if (!open) dismiss(i.id); }}
            duration={i.duration ?? (i.tone === 'error' ? 8000 : 5000)}
          >
            <Rx.Title className="ui-toast-title">{i.title}</Rx.Title>
            {i.description && <Rx.Description className="ui-toast-desc">{i.description}</Rx.Description>}
            <Rx.Close className="ui-close" aria-label={t('ui.close')}><IconClose size={16} /></Rx.Close>
          </Rx.Root>
        ))}
        <Rx.Viewport className="ui-toasts" />
      </Rx.Provider>
    </Ctx.Provider>
  );
}
