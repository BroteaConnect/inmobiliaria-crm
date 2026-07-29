import { useState } from 'react';
import { crearPropietario, crearPropiedad, loadPropietarios } from './api';

// Parser CSV mínimo y suficiente (comillas, separador coma o punto y coma).
function parseCsv(text: string): string[][] {
  const sep = text.split('\n')[0].includes(';') ? ';' : ',';
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

const CAMPOS = [
  ['(ignorar)', ''],
  ['Propietario · nombre', 'p_nombre'], ['Propietario · teléfono', 'p_telefono'], ['Propietario · email', 'p_email'],
  ['Propiedad · título', 'titulo'], ['Propiedad · municipio', 'municipio'], ['Propiedad · dirección', 'direccion'],
  ['Propiedad · precio', 'precio'], ['Propiedad · habitaciones', 'habitaciones'],
  ['Propiedad · baños', 'banos'], ['Propiedad · m²', 'superficie'], ['Propiedad · descripción', 'descripcion'],
] as const;

// Adivina el mapeo por el nombre de la columna del Excel de la clienta.
const adivina = (h: string): string => {
  const s = h.toLowerCase();
  if (/propietari|dueñ|cliente|vendedor/.test(s) && /tel/.test(s)) return 'p_telefono';
  if (/propietari|dueñ|cliente|vendedor/.test(s) && /mail/.test(s)) return 'p_email';
  if (/propietari|dueñ|cliente|vendedor|nombre/.test(s)) return 'p_nombre';
  if (/t[ií]tulo|inmueble|vivienda/.test(s)) return 'titulo';
  if (/municipio|ciudad|localidad|zona/.test(s)) return 'municipio';
  if (/direc/.test(s)) return 'direccion';
  if (/precio|importe/.test(s)) return 'precio';
  if (/habitacion|dormitor/.test(s)) return 'habitaciones';
  if (/bañ/.test(s)) return 'banos';
  if (/superficie|metros|m2|m²/.test(s)) return 'superficie';
  if (/descrip|observa|notas/.test(s)) return 'descripcion';
  if (/tel[eé]fono/.test(s)) return 'p_telefono';
  return '';
};

export default function Importar() {
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
    setLog('Importando…');
    const existentes = await loadPropietarios();
    const ownerId = new Map(existentes.map((o) => [o.nombre.toLowerCase(), o.id]));
    let nProps = 0, nOwners = 0;
    for (const row of rows.slice(1)) {
      const val = (campo: string) => row[map.indexOf(campo)]?.trim() ?? '';
      let owner = '';
      const nombre = val('p_nombre');
      if (nombre) {
        owner = ownerId.get(nombre.toLowerCase()) ?? '';
        if (!owner) {
          const o = await crearPropietario({ nombre, telefono: val('p_telefono'), email: val('p_email') || undefined });
          ownerId.set(nombre.toLowerCase(), o.id);
          owner = o.id;
          nOwners++;
        }
      }
      const titulo = val('titulo') || (val('direccion') && `Vivienda en ${val('direccion')}`);
      if (!titulo) continue;
      await crearPropiedad({
        titulo, municipio: val('municipio'), direccion: val('direccion'),
        precio: Number(val('precio').replace(/[^\d]/g, '')) || undefined,
        habitaciones: Number(val('habitaciones')) || undefined,
        banos: Number(val('banos')) || undefined,
        superficie: Number(val('superficie').replace(/[^\d]/g, '')) || undefined,
        descripcion: val('descripcion'), estado: 'borrador', propietario: owner || undefined,
      });
      nProps++;
    }
    setLog(`✓ Importados ${nOwners} propietarios y ${nProps} propiedades (en borrador — revisa y publica).`);
  };

  return (
    <div className="importar">
      <h1>Importar desde tu Excel</h1>
      <p className="ayuda">Guarda tu Excel como <strong>CSV</strong> (Archivo → Guardar como → CSV) y súbelo.
        Revisa a qué corresponde cada columna y pulsa importar. Todo entra como borrador.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
      {rows.length > 0 && (
        <>
          <div className="mapa">
            <table>
              <thead><tr>{rows[0].map((h, i) => (
                <th key={i}>
                  <div className="col-origen">{h || `Columna ${i + 1}`}</div>
                  <select value={map[i] ?? ''} onChange={(e) => setMap((m) => m.map((v, j) => (j === i ? e.target.value : v)))}>
                    {CAMPOS.map(([label, v]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </th>
              ))}</tr></thead>
              <tbody>{rows.slice(1, 4).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <p className="ayuda">{rows.length - 1} filas detectadas (se muestran las 3 primeras).</p>
          <button className="primario" onClick={importar}>Importar {rows.length - 1} filas</button>
        </>
      )}
      <p role="status" className="resultado">{log}</p>
    </div>
  );
}
