import type { ReactElement } from 'react';
// brotea:imports
import { auth } from './auth/route';

export type Feature = {
  path: string;
  /** clave i18n de la etiqueta del nav */
  labelKey: string;
  element: ReactElement;
  /**
   * Enrutable pero no un destino: el callback de OAuth necesita ruta y no debe
   * salir nunca en la navegación.
   */
  hidden?: boolean;
};

// Installed features register here. The CLI wires each entry between the
// anchors below — do not remove the `brotea:` comment markers.
export const features: Feature[] = [
  // brotea:register
  auth,
];
