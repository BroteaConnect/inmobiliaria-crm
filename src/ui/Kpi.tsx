/**
 * One KPI, one variant. Deliberately dumb: it renders the number it is handed
 * and has no idea where it came from.
 *
 * The rule that keeps it honest lives at the call site — a KPI is rendered only
 * when it was computed from real data. The design's illustrative "312 / 986"
 * and "-38% no-shows" are not numbers this app knows, so this app does not show
 * them.
 */
export default function Kpi({
  label,
  value,
  hint,
}: {
  /** Already translated. */
  label: string;
  /** Already formatted for the locale by the caller. */
  value: string;
  hint?: string;
}) {
  return (
    <div className="ui-kpi" title={hint}>
      <span className="ui-kpi-value">{value}</span>
      <span className="ui-kpi-label">{label}</span>
    </div>
  );
}
