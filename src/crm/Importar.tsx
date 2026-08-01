import { useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import {
  crearPropietario, crearPropiedad, crearLead, loadPropietarios, loadLeads, loadPropiedades,
} from './api';

// Parser CSV/TSV mínimo y suficiente (comillas, separador tab, coma o punto y coma).
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

// El destino de cada columna. La etiqueta que ve la agente sale del
// diccionario (campo.<clave>); aquí solo vive el nombre del campo.
const CAMPOS = [
  '', 'p_nombre', 'p_telefono', 'p_email', 'p_pais', 'party_tipo',
  'titulo', 'municipio', 'proyecto', 'edificio', 'unidad', 'direccion',
  'precio', 'habitaciones', 'banos', 'superficie', 'descripcion',
  't_fecha', 't_proc',
] as const;

// Autodetección de cabeceras: sinónimos en español + el esquema de registros
// de transacciones (Transaction Date/Value, Master Project, BuildingNameEn,
// UnitNumber, ProcedurePartyTypeNameEn, NameEn, Mobile, ProcedureNameEn…).
// Para soportar otro Excel: añade aquí sus cabeceras.
const adivina = (h: string): string => {
  const s = h.toLowerCase().trim();
  if (/transaction ?date|^fecha/.test(s)) return 't_fecha';
  if (/transaction ?value|valor|precio|importe|amount/.test(s)) return 'precio';
  if (/master ?project/.test(s)) return 'municipio';
  if (/building/.test(s)) return 'edificio';
  if (/unit ?(number|no)|^unidad/.test(s)) return 'unidad';
  if (/party ?type|^rol/.test(s)) return 'party_tipo';
  if (/procedure ?name|procedimiento/.test(s)) return 't_proc';
  if (/country|país|pais|nacionalidad/.test(s)) return 'p_pais';
  if (/mobile|m[óo]vil|tel[eé]fono|phone/.test(s)) return 'p_telefono';
  if (/^project|proyecto/.test(s)) return 'proyecto';
  if (/^name(en)?$|nombre|propietari|dueñ|cliente|vendedor/.test(s)) return 'p_nombre';
  if (/t[ií]tulo|inmueble|vivienda/.test(s)) return 'titulo';
  if (/municipio|ciudad|localidad|zona/.test(s)) return 'municipio';
  if (/direc/.test(s)) return 'direccion';
  if (/habitacion|dormitor|bedroom/.test(s)) return 'habitaciones';
  if (/bañ|bathroom/.test(s)) return 'banos';
  if (/superficie|metros|m2|m²|^size|sqft|area/.test(s)) return 'superficie';
  if (/descrip|observa|notas/.test(s)) return 'descripcion';
  if (/mail/.test(s)) return 'p_email';
  return '';
};

// "1,250,000.50" → 1250000.5 (separador de miles fuera, decimal dentro)
const numero = (v: string) => {
  const limpio = v.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

// El registro de la clienta trae Size en pies cuadrados → guardamos m².
const SQFT_A_M2 = 0.092903;
const superficieM2 = (v: string) => {
  const n = numero(v);
  return n === undefined ? undefined : Math.round(n * SQFT_A_M2);
};

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
      const propId = new Map((await loadPropiedades()).map((p) => [p.titulo.toLowerCase(), p.id]));

      let nProps = 0, nOwners = 0, nLeads = 0, saltadas = 0;
      for (const row of rows.slice(1)) {
        const val = (campo: string) => row[map.indexOf(campo)]?.trim() ?? '';
        const rol = val('party_tipo').toLowerCase();
        const esComprador = /buyer|comprador/.test(rol);
        const nombre = val('p_nombre');
        const contexto = [
          val('t_proc') && `Procedimiento: ${val('t_proc')}`,
          val('t_fecha') && `Fecha: ${val('t_fecha')}`,
          val('p_pais') && `País: ${val('p_pais')}`,
        ].filter(Boolean).join(' · ');

        // título: explícito o compuesto proyecto + edificio + unidad
        const titulo = val('titulo') ||
          [val('proyecto') || val('municipio'), val('edificio'), val('unidad') && `unidad ${val('unidad')}`]
            .filter(Boolean).join(' · ');

        if (esComprador) {
          // Compradores del histórico → leads en cartera (matching futuro)
          if (!nombre || leadYaExiste.has(nombre.toLowerCase())) { saltadas++; continue; }
          await crearLead({
            nombre, telefono: val('p_telefono'), email: val('p_email') || undefined,
            etapa: 'nutriendo', origen: 'histórico',
            criterios: [titulo && `Compró en ${titulo}`, val('precio') && `~${val('precio')}`, contexto]
              .filter(Boolean).join(' · '),
          });
          leadYaExiste.add(nombre.toLowerCase());
          nLeads++;
          continue;
        }

        // Vendedores (o filas sin rol) → propietario + propiedad
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
        if (!titulo || propId.has(titulo.toLowerCase())) { saltadas++; continue; }
        const p = await crearPropiedad({
          titulo,
          municipio: val('municipio') || undefined,
          direccion: val('direccion') || [val('edificio'), val('unidad')].filter(Boolean).join(', ') || undefined,
          precio: numero(val('precio')),
          habitaciones: numero(val('habitaciones')),
          banos: numero(val('banos')),
          superficie: superficieM2(val('superficie')),
          descripcion: [val('descripcion'), contexto].filter(Boolean).join(' — ') || undefined,
          estado: 'borrador',
          propietario: owner || undefined,
        });
        propId.set(titulo.toLowerCase(), p.id);
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
      <input type="file" accept=".csv,text/csv,.tsv" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
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
