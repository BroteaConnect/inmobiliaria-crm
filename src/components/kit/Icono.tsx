// Los iconos del kit, dibujados y no escritos.
//
// Estaban puestos como emoji (💬, 📞, ✉️) y un emoji no es un icono: es un
// carácter que cada sistema dibuja a su manera y que algunos no tienen. En
// Windows salen planos y en blanco y negro, en un servidor sin fuente de emoji
// salen como cuadraditos, y en ningún caso se puede pedir que sigan el color
// del texto. El SVG se dibuja igual en todas partes y hereda `currentColor`,
// que es lo que permite que el mismo botón funcione sobre fondo claro y oscuro.
//
// El sitio público de la clienta ya lo tenía escrito en su documentación de
// identidad —«nada de emoji en la interfaz»— y el CRM iba por otro lado.

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

/** El globo de WhatsApp: relleno, porque va sobre el verde del canal. */
export const IconoWhatsApp = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3a2.7 2.7 0 0 0-.8 2c0 1.2.8 2.3 1 2.5a9.3 9.3 0 0 0 3.6 3.2c1.7.7 1.7.5 2 .4.3 0 1.4-.5 1.6-1.1.2-.6.2-1 .1-1.1Z" />
  </svg>
);

export const IconoTelefono = () => (
  <svg {...base}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" />
  </svg>
);

export const IconoEmail = () => (
  <svg {...base}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
);

// The rest of the set, added when the glyphs went (E2). `◔ ☰ ⌂ ···` in the tab
// bar and `← → × ✕ 📷` on the buttons were characters, not icons: each font
// draws them at its own weight and some fonts do not have them at all. One
// stroke weight for the whole set, `currentColor` everywhere, `size` in CSS
// pixels so a tab icon and a button icon come from the same drawing.
type IconProps = { size?: number };
const sized = (size: number) => ({ ...base, width: size, height: size });

export const IconClock = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconList = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconHome = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export const IconDots = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

export const IconArrowLeft = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M19 12H5" />
    <path d="m12 5-7 7 7 7" />
  </svg>
);

export const IconArrowRight = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export const IconClose = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconCamera = ({ size = 16 }: IconProps) => (
  <svg {...sized(size)}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
