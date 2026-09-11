// The three glyphs the primitives need, inline and in `currentColor`, so they
// take the colour of the control they sit in and no icon package is added.
type IconProps = { size?: number };

const svg = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconClose = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconChevron = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconCheck = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}><path d="M5 12l5 5L20 7" /></svg>
);
