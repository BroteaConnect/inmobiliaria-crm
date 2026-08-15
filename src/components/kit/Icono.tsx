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
