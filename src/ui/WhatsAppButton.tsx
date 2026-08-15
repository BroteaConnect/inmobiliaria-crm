/**
 * The WhatsApp call to action, identical everywhere it appears — that is the
 * whole point of it being a component. It is a real anchor, so long-press,
 * middle-click and "copy link" behave the way the agent expects on a phone.
 *
 * No href means no phone number, and then there is nothing to render: a dead
 * button that opens an empty chat is worse than an absent one.
 */
export default function WhatsAppButton({
  href,
  label,
  ariaLabel,
  onOpen,
}: {
  href: string;
  /** Already translated. */
  label: string;
  ariaLabel?: string;
  onOpen?: () => void;
}) {
  if (!href) return null;
  return (
    <a
      className="ui-wa"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      onClick={onOpen}
    >
      {label}
    </a>
  );
}
