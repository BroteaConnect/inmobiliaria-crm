// The kit — eight components from TURNO 10a of "Admin Brotea · Propuestas".
//
// Rules that make this a kit rather than a folder:
//   · nothing here imports from src/crm/ or src/features/ — no data, no
//     PocketBase, no i18n. Every string arrives already translated as a prop.
//   · every colour is a var(--…) from theme.css or styles/identity.css. There
//     is not one hex value in this directory.
export { default as AlertBadge } from './AlertBadge';
export { default as Button } from './Button';
export { default as Chip } from './Chip';
export { default as Kpi } from './Kpi';
export { default as ListCard } from './ListCard';
export { default as PriorityDot } from './PriorityDot';
export { default as SegmentedNav } from './SegmentedNav';
export { default as Toggle } from './Toggle';
export { default as WhatsAppButton } from './WhatsAppButton';

export type { SignalLevel } from './PriorityDot';
export type { NavItem } from './SegmentedNav';
