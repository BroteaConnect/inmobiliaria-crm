/**
 * One component for the desktop pills and the mobile tab bar — the design draws
 * them as the same control at two sizes, so they are one implementation with a
 * media query, not two lists that drift apart.
 *
 * The items are real anchors even though the app is a SPA: `onSelect` handles
 * the plain click, and a modified click (new tab, middle button) is left to the
 * browser. A row of `<button>`s would have quietly removed that.
 */
export interface NavItem {
  id: string;
  /** Already translated: this kit never calls t(). */
  label: string;
  href: string;
  current?: boolean;
}

export default function SegmentedNav({
  items,
  ariaLabel,
  onSelect,
}: {
  items: NavItem[];
  ariaLabel: string;
  onSelect?: (item: NavItem) => void;
}) {
  return (
    <nav className="ui-nav" aria-label={ariaLabel}>
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          className={`ui-nav-item${item.current ? ' is-current' : ''}`}
          aria-current={item.current ? 'page' : undefined}
          onClick={(e) => {
            if (!onSelect) return;
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onSelect(item);
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
