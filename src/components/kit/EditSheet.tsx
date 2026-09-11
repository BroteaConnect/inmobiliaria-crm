import { useState, type ReactNode } from 'react';
import { SidePanel } from './SidePanel';

// The tenth component: where a record is filled in.
//
// Every form in this CRM is the same shape — a side panel, fields in one
// column, one primary that saves and one ghost that gives up — and it was
// written twice, differently, before this existed: the new-lead panel and the
// property form, which was not even a panel but a block that unfolded over the
// grid. Two anatomies for one act is how a screen ends up asking the agent to
// learn the app twice.
//
// What it adds over hand-rolling the same thing a third time:
//
//   · the fields are a real <form>, so Enter saves and `required` is the
//     browser's job. The submit button lives in the panel's footer, outside
//     the form element, and reaches it through `form="<id>"` — which is what
//     that attribute is for, and the only way to keep the actions in a bar
//     that does not scroll away with the content.
//   · it cannot be closed while it is saving. A panel that vanishes mid-save
//     invites a second entry, and the first one lands seconds later.
//   · a failure is said INSIDE the panel (`error`, through the kit's Sheet).
//     An open sheet hides the toasts from assistive technology, so a toast
//     alone is feedback a screen-reader user never gets.

// The form id only has to be unique in the document, and this app never
// renders on a server, so a counter is enough and reads better than a hash.
let seq = 0;

export function EditSheet({
  open, onClose, onSubmit, title, subtitle, error, busy = false, canSave = true,
  saveLabel, busyLabel, cancelLabel, extraActions, children,
}: {
  open: boolean;
  onClose: () => void;
  /** Called on submit (Enter in a field, or the primary). Never with `busy`. */
  onSubmit: () => void;
  title: string;
  subtitle?: ReactNode;
  /** What went wrong with the save, in the panel, as `role="alert"`. */
  error?: ReactNode;
  /** A save in flight: the panel locks and the primary says so. */
  busy?: boolean;
  /** False while the record has not got enough to be saved. */
  canSave?: boolean;
  saveLabel: string;
  busyLabel: string;
  cancelLabel: string;
  /** A second, lower-weight action for the footer. Never a rival primary. */
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const [formId] = useState(() => `edit-form-${++seq}`);
  return (
    <SidePanel
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={title}
      subtitle={subtitle}
      error={error}
      footer={(
        <>
          {extraActions}
          <button type="button" className="kit-btn kit-btn-ghost" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="submit" form={formId} className="kit-btn kit-btn-primary" disabled={busy || !canSave}>
            {busy ? busyLabel : saveLabel}
          </button>
        </>
      )}
    >
      <form
        id={formId}
        onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}
      >
        {children}
      </form>
    </SidePanel>
  );
}
