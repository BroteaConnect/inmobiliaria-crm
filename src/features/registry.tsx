import type { ReactElement } from 'react';
// brotea:imports

export type Feature = {
  path: string;
  /** clave i18n de la etiqueta del nav */
  labelKey: string;
  element: ReactElement;
};

// Installed features register here. The CLI wires each entry between the
// anchors below — do not remove the `brotea:` comment markers.
export const features: Feature[] = [
  // brotea:register
];
