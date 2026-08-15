// Los informes, como cálculo puro: entran filas, salen números.
//
// Sin React y sin PocketBase, para que `node --test` pueda comprobarlos — que en
// un informe es donde más importa: una cifra mal calculada no falla, se publica.
//
// Solo se calcula lo que estas filas pueden saber. El diseño dibuja además
// visitas realizadas, comisión, tasa de no-show y rendimiento por agente: no hay
// colección de visitas, ni campo de comisión, ni asignación de agente, así que no
// aparecen. Un panel que enseña una cifra que no puede conocer es peor que un
// panel con menos cifras.
import type { Actividad, Lead } from '../../crm/api';

/** PocketBase manda "2026-08-15 09:14:00Z"; Date quiere la T. */
const at = (iso?: string): number => (iso ? new Date(iso.replace(' ', 'T')).getTime() : Number.NaN);

const DIA = 86400000;

export interface Periodo { desde: number; hasta: number }

/** Los últimos `dias` días, y el periodo inmediatamente anterior de igual largo,
 *  que es contra el que se compara todo aquí. */
export function periodos(dias: number, ahora: number = Date.now()): { actual: Periodo; previo: Periodo } {
  const largo = dias * DIA;
  return {
    actual: { desde: ahora - largo, hasta: ahora },
    previo: { desde: ahora - 2 * largo, hasta: ahora - largo },
  };
}

const dentro = (ms: number, p: Periodo) => Number.isFinite(ms) && ms >= p.desde && ms < p.hasta;

/** Leads creados en el periodo. */
export const nuevos = (leads: readonly Lead[], p: Periodo) =>
  leads.filter((l) => dentro(at(l.created), p)).length;

/**
 * Variación entre dos cantidades, en porcentaje entero.
 *
 * `null` cuando el periodo anterior fue cero: «infinito por ciento» no es una
 * cifra que nadie pueda usar, y un 0 → 3 se lee mejor como «3, antes ninguno».
 */
export function variacion(actual: number, previo: number): number | null {
  if (previo === 0) return null;
  return Math.round(((actual - previo) / previo) * 100);
}

/** Cuántos leads hay en cada etapa, en el orden del tablero. */
export function embudo(leads: readonly Lead[], etapas: readonly string[]): { etapa: string; n: number }[] {
  return etapas.map((etapa) => ({ etapa, n: leads.filter((l) => l.etapa === etapa).length }));
}

/**
 * Mediana de horas hasta el primer contacto SALIENTE de cada lead.
 *
 * Mediana y no media: un lead al que se contestó tres semanas tarde arrastra una
 * media hasta volverla mentira, y lo que se quiere saber es cuánto tarda el caso
 * normal. Los leads sin respuesta todavía no cuentan — no son un cero, son una
 * pregunta abierta, y meterlos como cero diría que se responde más rápido de lo
 * que se responde.
 */
export function tiempoPrimeraRespuesta(
  leads: readonly Lead[],
  actividades: readonly Actividad[],
  p: Periodo,
): { horas: number | null; medidos: number; sinResponder: number } {
  const salientes = new Map<string, number>();
  for (const a of actividades) {
    if (a.direccion === 'entrante' || a.tipo === 'nota') continue;
    const t = at(a.created);
    const visto = salientes.get(a.lead);
    if (!Number.isFinite(t)) continue;
    if (visto === undefined || t < visto) salientes.set(a.lead, t);
  }
  const horas: number[] = [];
  let sinResponder = 0;
  for (const l of leads) {
    const creado = at(l.created);
    if (!dentro(creado, p)) continue;
    const primera = salientes.get(l.id);
    if (primera === undefined || primera < creado) { sinResponder += 1; continue; }
    horas.push((primera - creado) / 3600000);
  }
  if (!horas.length) return { horas: null, medidos: 0, sinResponder };
  horas.sort((a, b) => a - b);
  const mitad = Math.floor(horas.length / 2);
  const mediana = horas.length % 2 ? horas[mitad] : (horas[mitad - 1] + horas[mitad]) / 2;
  return { horas: Math.round(mediana * 10) / 10, medidos: horas.length, sinResponder };
}

/**
 * De dónde vienen los leads del periodo.
 *
 * `origen` es texto libre —lo escribe quien importa un CSV— así que se normaliza
 * en minúsculas y sin espacios de sobra; lo vacío se cuenta aparte en vez de
 * inventarle una procedencia.
 */
export function procedencia(leads: readonly Lead[], p: Periodo): { origen: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const l of leads) {
    if (!dentro(at(l.created), p)) continue;
    const clave = (l.origen ?? '').trim().toLowerCase() || '(sin origen)';
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([origen, n]) => ({ origen, n }))
    .sort((a, b) => b.n - a.n || a.origen.localeCompare(b.origen));
}
