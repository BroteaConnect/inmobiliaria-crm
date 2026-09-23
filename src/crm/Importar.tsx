import { useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import {
  crearPropietario, crearPropiedad, crearLead, loadPropietarios, loadLeads, loadPropiedades,
} from './api';
import {
  CAMPOS, adivina, claveDuplicado, contextoDe, criteriosDe, propiedadDe, tituloDe,
  type Accessor,
} from './import-mapping';

// A CSV/TSV parser, minimal and sufficient (quotes; tab, comma or semicolon).
function parseCsv(text: string): string[][] {
  const first = text.split('\n')[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
  return rows;
}

// The column heuristics, the junk rule and the row → record mapping live in
// import-mapping.ts (pure, tested). This file is the screen and the loop.
export default function Importar() {
  const { t } = useI18n();
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<string[]>([]);
  const [log, setLog] = useState('');

  const leer = (f: File) => f.text().then((t) => {
    const r = parseCsv(t);
    setRows(r);
    setMap(r[0]?.map(adivina) ?? []);
    setLog('');
  });

  const importar = async () => {
    setLog(t('imp.importando'));
    try {
      const propietarios = await loadPropietarios();
      const ownerId = new Map(propietarios.map((o) => [o.nombre.toLowerCase(), o.id]));
      const leadYaExiste = new Set((await loadLeads()).map((l) => l.nombre.toLowerCase()));
      // Keyed by claveDuplicado on BOTH sides: a property imported before the
      // junk rule ("- · Burj Vista 1 · unidad 2205") and the same row imported
      // after it ("Burj Vista 1 · unidad 2205") are one property, not two.
      const propYaExiste = new Set((await loadPropiedades()).map((p) => claveDuplicado(p.titulo)));

      let nProps = 0, nOwners = 0, nLeads = 0, saltadas = 0;
      for (const row of rows.slice(1)) {
        const val: Accessor = (campo) => row[map.indexOf(campo)]?.trim() ?? '';
        const rol = val('party_tipo').toLowerCase();
        const esComprador = /buyer|comprador/.test(rol);
        const nombre = val('p_nombre');
        const contexto = contextoDe(val);
        const titulo = tituloDe(val);

        if (esComprador) {
          // Historical buyers → leads in the portfolio (future matching)
          if (!nombre || leadYaExiste.has(nombre.toLowerCase())) { saltadas++; continue; }
          await crearLead({
            nombre, telefono: val('p_telefono'), email: val('p_email') || undefined,
            etapa: 'nutriendo', origen: 'histórico', // lang-sweep: allow
            criterios: criteriosDe(val),
          });
          leadYaExiste.add(nombre.toLowerCase());
          nLeads++;
          continue;
        }

        // Sellers (or rows without a role) → owner + property
        let owner = '';
        if (nombre) {
          owner = ownerId.get(nombre.toLowerCase()) ?? '';
          if (!owner) {
            const o = await crearPropietario({
              nombre, telefono: val('p_telefono'), email: val('p_email') || undefined,
              notas: contexto || undefined,
            });
            ownerId.set(nombre.toLowerCase(), o.id);
            owner = o.id;
            nOwners++;
          }
        }
        const clave = claveDuplicado(titulo);
        if (!titulo || propYaExiste.has(clave)) { saltadas++; continue; }
        await crearPropiedad({ ...propiedadDe(val), propietario: owner || undefined });
        propYaExiste.add(clave);
        nProps++;
      }
      setLog(t('imp.ok', { owners: nOwners, props: nProps, leads: nLeads })
        + (saltadas ? t('imp.saltadas', { count: saltadas }) : ''));
    } catch (err) {
      setLog(t('imp.error', { error: (err as Error).message }));
    }
  };

  return (
    <div className="importar">
      <h1>{t('imp.titulo')}</h1>
      <p className="ayuda">{t('imp.paso1')} {t('imp.paso2')} {t('imp.paso3')}</p>
      <label className="archivo">
        <span>{t('imp.archivo')}</span>
        <input type="file" accept=".csv,text/csv,.tsv" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
      </label>
      {rows.length > 0 && (
        <>
          <div className="mapa">
            <table>
              <thead><tr>{rows[0].map((h, i) => (
                <th key={i}>
                  <div className="col-origen">{h || t('imp.columna', { n: i + 1 })}</div>
                  <select value={map[i] ?? ''} onChange={(e) => setMap((m) => m.map((v, j) => (j === i ? e.target.value : v)))}>
                    {CAMPOS.map((v) => (
                      <option key={v} value={v}>{t(v ? `campo.${v}` : 'campo.ignorar')}</option>
                    ))}
                  </select>
                </th>
              ))}</tr></thead>
              <tbody>{rows.slice(1, 4).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <p className="ayuda">{t('imp.filas', { count: rows.length - 1 })}</p>
          <button className="primario" onClick={importar}>{t('imp.importar', { count: rows.length - 1 })}</button>
        </>
      )}
      <p role="status" className="resultado">{log}</p>
    </div>
  );
}
