import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/LocaleContext';
import { useList } from '../lib/useList';
import { ListStatus, Pager } from '../components/Pager';
import { EditSheet } from '../components/kit/EditSheet';
import { Select, useToast } from '../components/ui';
import { IconArrowLeft, IconClose } from '../components/kit/Icono';
import {
  type ContentEstado, type ContentResult, type Plantilla,
  loadPlantillas, guardarPlantilla, sincronizarContent,
} from './api';
import {
  EMPTY_PLANTILLA, congelados, contentAprobado, esDirty, fieldsOf, payloadOf, validate,
  type PlantillaFields, type Problema,
} from './plantilla-form';
import './plantillas.css';

// Ajustes → Plantillas: the message repository, edited where it is read.
//
// The rows are seeded by the platform (pb/plantillas.json in the landing repo)
// and this screen EDITS them: name, category, lifecycle state, the two
// subjects, the two bodies and the declared variables. `clave`, `canal` and
// `evento` are shown and never written — the chassis and the assistant address
// a template by its clave, and a key that can be edited is a key that stops
// matching.
//
// "Versions them" is the counter on the row: every real save bumps `version`,
// and `envios.plantilla_version` records which number actually went out. The
// model E1 declared has no history collection, so the previous TEXT is not
// kept — what is kept is which version each delivery used. Inventing a second
// collection for the history is a schema decision, and this screen does not
// take schema decisions.
//
// Searching, filtering and paging come from the `list` brick, like the
// properties grid: thirty rows fit on one screen only until the agency writes
// the thirty-first.
//
// One row is not editable at all in its text: a WhatsApp template Meta has
// APPROVED. From then on Twilio sends the Content Meta holds, and the row's
// `variables` array is the positional key that fills it — the chassis maps
// values onto `{{1}} {{2}} {{3}}` in this array's order. An edit here would
// not reach the client but WOULD move the values, putting the date where the
// property should be on a message that has already left. Neither the approved
// text nor the version it was approved at is readable from the CRM, so the
// drift is not detected, it is prevented: the two bodies and the variable list
// are read only while a Content is approved (plantilla-form.ts `congelados`).

const TAMANO = 12;
/** The columns that can be sorted, in the order they are read. */
// Sorting reads the STORED value, not the translated label: the labels of
// every one of these columns keep the stored order in both languages
// (aprobada/borrador/retirada reads as Approved/Draft/Retired), and sorting
// on a translation would reorder the table when the language switches.
const COLUMNAS = ['clave', 'nombre', 'canal', 'categoria', 'estado', 'version'] as const;
type Columna = (typeof COLUMNAS)[number];

const CONTENT_KEYS = [
  'content_sid', 'content_sid_en', 'content_estado', 'content_estado_en', 'content_motivo', 'content_motivo_en',
] as const;

/** A row with what the chassis just read back from Twilio. */
function conContent(row: Plantilla, c: Partial<ContentResult>): Plantilla {
  const next: Plantilla = { ...row };
  for (const k of CONTENT_KEYS) {
    if (c[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = c[k];
  }
  return next;
}

/** A clave breaks at its dots on a narrow column, never mid-word. */
const claveConCortes = (clave: string) => clave.split('.').map((seg, i) => (
  <Fragment key={i}>{i > 0 && <>.<wbr /></>}{seg}</Fragment>
));

export default function Plantillas() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<Plantilla[]>([]);
  // False until the first answer: an empty list before the load is not "no
  // templates", and a failed load is not either.
  const [cargado, setCargado] = useState(false);
  const [fallo, setFallo] = useState<Error | null>(null);
  const [canal, setCanal] = useState('');
  const [categoria, setCategoria] = useState('');
  const [abierta, setAbierta] = useState<Plantilla | null>(null);
  const [campos, setCampos] = useState<PlantillaFields>(EMPTY_PLANTILLA);
  const [nuevaVariable, setNuevaVariable] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    let vivo = true;
    loadPlantillas()
      .then((r) => { if (vivo) { setRows(r); setFallo(null); } })
      .catch((e: unknown) => { if (vivo) setFallo(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (vivo) setCargado(true); });
    return () => { vivo = false; };
  }, []);

  // The two filters are applied before the brick: it searches, sorts and
  // pages what is left, so page 2 of "WhatsApp" is page 2 of WhatsApp.
  const filtradas = useMemo(
    () => rows.filter((p) => (!canal || p.canal === canal) && (!categoria || (p.categoria ?? '') === categoria)),
    [rows, canal, categoria],
  );
  const lista = useList(filtradas, {
    fields: ['clave', 'nombre', 'cuerpo_es', 'cuerpo_en', 'evento'],
    size: TAMANO,
    sort: 'clave',
    locale,
  });

  const etiquetaEstado = (estado?: string) => t(`plantillas.estado.${estado || 'borrador'}`);
  const etiquetaContent = (estado?: ContentEstado) => t(`plantillas.content.${estado || 'unsubmitted'}`);
  const braces = (vs: string[]) => vs.map((v) => `{{${v}}}`).join(', ');
  const mensajeDe = (p: Problema): string => {
    switch (p.code) {
      case 'faltaNombre': return t('plantillas.errorFaltaNombre');
      case 'faltaCuerpo': return t('plantillas.errorFaltaCuerpo');
      case 'variableNombre': return t('plantillas.errorVariableNombre', { nombre: p.nombre });
      case 'noDeclarada':
        return t('plantillas.errorNoDeclarada', { idioma: t(`plantillas.idioma.${p.idioma}`), variables: braces(p.variables) });
      case 'distintas':
        return t('plantillas.errorDistintas', { es: braces(p.es), en: braces(p.en) });
    }
  };

  const abrir = (p: Plantilla) => {
    setAbierta(p);
    setCampos(fieldsOf(p));
    setNuevaVariable('');
    setError(null);
  };
  const cerrar = () => { setAbierta(null); setError(null); };

  /** The row, everywhere it is held: the list and the open editor. */
  const aplicarFila = (fila: Plantilla) => {
    setRows((rs) => rs.map((r) => (r.id === fila.id ? fila : r)));
    setAbierta((a) => (a && a.id === fila.id ? fila : a));
  };

  // The variable list: Enter (or leaving the box) adds what was typed. What is
  // still in the box when the form is submitted counts too, so a name typed
  // and not confirmed is never silently dropped from the save.
  const conPendiente = (f: PlantillaFields): PlantillaFields => {
    const v = nuevaVariable.trim();
    if (!v || f.variables.includes(v)) return f;
    return { ...f, variables: [...f.variables, v] };
  };
  const anadirVariable = () => {
    const v = nuevaVariable.trim();
    if (v && !campos.variables.includes(v)) setCampos({ ...campos, variables: [...campos.variables, v] });
    setNuevaVariable('');
  };
  const quitarVariable = (v: string) => setCampos({ ...campos, variables: campos.variables.filter((x) => x !== v) });

  const guardar = async () => {
    if (!abierta || guardando) return;
    const f = conPendiente(campos);
    setCampos(f);
    setNuevaVariable('');
    // The first problem, said in the panel. The primary is never greyed out
    // for an incomplete form: a dead button explains nothing.
    const problemas = validate(f);
    if (problemas.length) { setError(mensajeDe(problemas[0])); return; }
    // The controls are read only above; this is the rule, and it holds whether
    // or not a control was rendered.
    if (aprobadaEnTwilio && congelados(f, fieldsOf(abierta)).length) {
      setError(t('plantillas.errorCongelada'));
      return;
    }
    // Nothing changed: no PATCH, no version bump, no toast claiming a save.
    if (!esDirty(f, fieldsOf(abierta))) { cerrar(); return; }
    setGuardando(true);
    setError(null);
    try {
      const guardada = await guardarPlantilla(abierta.id, payloadOf(f, abierta));
      const fila = { ...abierta, ...guardada };
      aplicarFila(fila);
      toast({ tone: 'ok', title: t('plantillas.guardada', { nombre: fila.nombre, version: String(fila.version ?? '') }) });
      cerrar();
    } catch (e) {
      // Said inside the sheet too: an open panel hides the toast from
      // assistive technology, and the failure belongs where the focus is.
      const msg = t('plantillas.errorGuardar', { error: (e as Error).message });
      setError(msg);
      toast({ title: msg, tone: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  // Reading Twilio's answer back. It is a READ: the row is updated with what
  // Twilio says today, and nothing is submitted for approval from here —
  // submitting a Content is the chassis's own job and its own decision.
  const consultarTwilio = async () => {
    if (!abierta || consultando) return;
    setConsultando(true);
    setError(null);
    try {
      const r = await sincronizarContent(abierta.clave, locale);
      const cambio = r.updated?.find((u) => u.clave === abierta.clave);
      if (cambio) aplicarFila(conContent(abierta, cambio));
      toast({
        tone: 'ok',
        title: t('plantillas.twilio.consultado', {
          estado: etiquetaContent((cambio?.content_estado ?? abierta.content_estado) as ContentEstado | undefined),
        }),
      });
    } catch (e) {
      const msg = t('plantillas.twilio.error', { error: (e as Error).message });
      setError(msg);
      toast({ title: msg, tone: 'error' });
    } finally {
      setConsultando(false);
    }
  };

  const opcionesCategoria = [
    { value: '', label: t('plantillas.categoria.') },
    { value: 'utility', label: t('plantillas.categoria.utility') },
    { value: 'marketing', label: t('plantillas.categoria.marketing') },
  ];
  const opcionesEstado = (['borrador', 'aprobada', 'retirada'] as const)
    .map((e) => ({ value: e, label: etiquetaEstado(e) }));
  // Remounted when its options change (the VisitaDialog rule): inside a
  // <form> Radix mirrors the value into a hidden native select, and a value
  // that arrives with its options finds no <option> yet.
  const claveDe = (opciones: { value: string }[]) => opciones.map((o) => o.value).join('|');

  // The text Twilio approved is the SAVED one. Once a body moves away from it,
  // the approval no longer covers what the agent is writing.
  const aprobadaEnTwilio = !!abierta && contentAprobado(abierta);
  const cambiadaDesdeTwilio = (idioma: 'es' | 'en') =>
    aprobadaEnTwilio && !!abierta && campos[`cuerpo_${idioma}`] !== (abierta[`cuerpo_${idioma}`] ?? '');

  const pillContent = (estado: ContentEstado | undefined, idioma?: 'es' | 'en') => (
    <span className={`content-estado content-estado-${estado || 'unsubmitted'}`}>
      {idioma && <span className="pill-idioma">{idioma.toUpperCase()}</span>}
      {etiquetaContent(estado)}
    </span>
  );
  const pillsContent = (p: Plantilla) => (
    p.canal !== 'whatsapp'
      ? <span className="plantilla-na">{t('plantillas.content.na')}</span>
      : p.content_sid_en
        ? <span className="content-estados">{pillContent(p.content_estado, 'es')}{pillContent(p.content_estado_en, 'en')}</span>
        : pillContent(p.content_estado)
  );

  const cabecera = (col: Columna) => (
    <th
      scope="col"
      className={col === 'version' ? 'col-num' : undefined}
      aria-sort={lista.sort === col ? (lista.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`ordenar${lista.sort === col ? ` orden-${lista.dir}` : ''}`}
        onClick={() => lista.toggleSort(col)}
      >
        {t(`plantillas.col.${col}`)}
      </button>
    </th>
  );

  const filtrando = !!canal || !!categoria || lista.query.trim() !== '';

  return (
    <section className="ajustes plantillas-pagina">
      <Link className="volver" to="/ajustes"><IconArrowLeft size={16} /> {t('plantillas.volver')}</Link>
      <h1>{t('plantillas.titulo')}</h1>
      <p className="ajustes-intro">{t('plantillas.intro')}</p>

      <div className="plantillas-filtros">
        <input
          type="search"
          className="buscador"
          placeholder={t('plantillas.buscar')}
          aria-label={t('plantillas.buscarAria')}
          value={lista.query}
          onChange={(e) => lista.setQuery(e.target.value)}
        />
        <Select
          value={canal}
          onValueChange={setCanal}
          ariaLabel={t('plantillas.filtro.canal')}
          options={[
            { value: '', label: t('plantillas.filtro.todosCanales') },
            { value: 'whatsapp', label: t('plantillas.canal.whatsapp') },
            { value: 'email', label: t('plantillas.canal.email') },
          ]}
        />
        <Select
          value={categoria}
          onValueChange={setCategoria}
          ariaLabel={t('plantillas.filtro.categoria')}
          options={[
            { value: '', label: t('plantillas.filtro.todasCategorias') },
            { value: 'utility', label: t('plantillas.categoria.utility') },
            { value: 'marketing', label: t('plantillas.categoria.marketing') },
          ]}
        />
      </div>

      {/* Loading, a failed load, an empty repository and a search that matched
          nothing are four different sentences; an error never reads as "no
          templates". */}
      <ListStatus loading={!cargado} error={cargado ? fallo : null} />
      {cargado && !fallo && rows.length === 0 && <p className="list-status">{t('plantillas.vacio')}</p>}
      {cargado && !fallo && rows.length > 0 && lista.total === 0 && (
        <p className="list-status">{t('plantillas.sinResultados')}</p>
      )}

      {lista.total > 0 && (
        <table className="plantillas-tabla">
          <thead>
            <tr>
              {COLUMNAS.map((col) => <Fragment key={col}>{cabecera(col)}</Fragment>)}
              <th scope="col">{t('plantillas.col.twilio')}</th>
            </tr>
          </thead>
          <tbody>
            {lista.items.map((p) => (
              <tr key={p.id}>
                <td data-label={t('plantillas.col.clave')}><code>{claveConCortes(p.clave)}</code></td>
                <td data-label={t('plantillas.col.nombre')}>
                  {/* The one way in, like the lead card's name. */}
                  <button type="button" className="plantilla-abrir" aria-label={t('plantillas.abrir', { nombre: p.nombre })} onClick={() => abrir(p)}>
                    {p.nombre}
                  </button>
                </td>
                <td data-label={t('plantillas.col.canal')}>{t(`plantillas.canal.${p.canal}`)}</td>
                <td data-label={t('plantillas.col.categoria')}>{t(`plantillas.categoria.${p.categoria ?? ''}`)}</td>
                <td data-label={t('plantillas.col.estado')}>
                  <span className={`plantilla-estado plantilla-estado-${p.estado || 'borrador'}`}>{etiquetaEstado(p.estado)}</span>
                </td>
                <td data-label={t('plantillas.col.version')} className="col-num">{t('plantillas.version', { n: String(p.version ?? 0) })}</td>
                <td data-label={t('plantillas.col.twilio')}>{pillsContent(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pager page={lista} onPage={lista.setPage} />
      {filtrando && lista.total > 0 && (
        <p className="plantillas-cuenta" role="status">{t('plantillas.cuenta', { n: String(lista.total), total: String(rows.length) })}</p>
      )}

      {abierta && (
        <EditSheet
          open
          onClose={cerrar}
          onSubmit={guardar}
          title={t('plantillas.editarTitulo', { nombre: abierta.nombre })}
          subtitle={[abierta.clave, t(`plantillas.canal.${abierta.canal}`), t('plantillas.version', { n: String(abierta.version ?? 0) })].join(' · ')}
          error={error}
          busy={guardando}
          saveLabel={t('plantillas.guardar')}
          busyLabel={t('plantillas.guardando')}
          cancelLabel={t('plantillas.cancelar')}
        >
          <p className="pista plantilla-ayuda">{t('plantillas.editarAyuda', { n: String((abierta.version ?? 0) + 1) })}</p>

          {/* Said once, above everything it applies to, in the same shape the
              send dialog uses for "this is what will actually happen". */}
          {aprobadaEnTwilio && (
            <p className="plantilla-reparo plantilla-reparo-aviso" role="status">{t('plantillas.twilio.congelada')}</p>
          )}

          <label className="campo">{t('plantillas.campo.nombre')}
            <input value={campos.nombre} required autoFocus onChange={(e) => setCampos({ ...campos, nombre: e.target.value })} />
          </label>

          <div className="campos-2">
            <div className="campo">
              <span>{t('plantillas.campo.categoria')}</span>
              <Select
                key={claveDe(opcionesCategoria)}
                value={campos.categoria}
                onValueChange={(v) => setCampos({ ...campos, categoria: v as PlantillaFields['categoria'] })}
                ariaLabel={t('plantillas.campo.categoria')}
                options={opcionesCategoria}
              />
            </div>
            <div className="campo">
              <span>{t('plantillas.campo.estado')}</span>
              <Select
                key={claveDe(opcionesEstado)}
                value={campos.estado}
                onValueChange={(v) => setCampos({ ...campos, estado: v as PlantillaFields['estado'] })}
                ariaLabel={t('plantillas.campo.estado')}
                options={opcionesEstado}
              />
            </div>
          </div>

          {/* The two languages side by side on a laptop, stacked on a phone:
              they are one text in two versions and they are edited by
              comparison, not by scrolling from one to the other. */}
          <div className="idiomas">
            <div className="idioma">
              <h3>{t('plantillas.idiomaEs')}</h3>
              {abierta.canal === 'email' && (
                <label className="campo">{t('plantillas.campo.asunto')}
                  <input value={campos.asunto_es} onChange={(e) => setCampos({ ...campos, asunto_es: e.target.value })} />
                </label>
              )}
              <label className="campo">{t('plantillas.campo.cuerpo')}
                <textarea
                  rows={8} value={campos.cuerpo_es} readOnly={aprobadaEnTwilio}
                  onChange={(e) => setCampos({ ...campos, cuerpo_es: e.target.value })}
                />
                {cambiadaDesdeTwilio('es') && <span className="campo-ayuda">{t('plantillas.twilio.cambiada')}</span>}
              </label>
            </div>
            <div className="idioma">
              <h3>{t('plantillas.idiomaEn')}</h3>
              {abierta.canal === 'email' && (
                <label className="campo">{t('plantillas.campo.asunto')}
                  <input value={campos.asunto_en} onChange={(e) => setCampos({ ...campos, asunto_en: e.target.value })} />
                </label>
              )}
              <label className="campo">{t('plantillas.campo.cuerpo')}
                <textarea
                  rows={8} value={campos.cuerpo_en} readOnly={aprobadaEnTwilio}
                  onChange={(e) => setCampos({ ...campos, cuerpo_en: e.target.value })}
                />
                {cambiadaDesdeTwilio('en') && <span className="campo-ayuda">{t('plantillas.twilio.cambiada')}</span>}
              </label>
            </div>
          </div>

          <div className="campo">
            {aprobadaEnTwilio
              ? <span>{t('plantillas.campo.variables')}</span>
              : <label htmlFor="plantilla-variable">{t('plantillas.campo.variables')}</label>}
            {campos.variables.length > 0 && (
              <ul className="variables-lista" aria-label={t('plantillas.campo.variables')}>
                {campos.variables.map((v) => (
                  <li key={v} className="variable-token">
                    <code>{v}</code>
                    {/* The order of this list is the positional key of the
                        approved Content: while Meta holds one, nothing here
                        adds, removes or reorders a name. */}
                    {!aprobadaEnTwilio && (
                      <button type="button" className="variable-quitar" aria-label={t('plantillas.variableQuitar', { nombre: v })} onClick={() => quitarVariable(v)}>
                        <IconClose size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!aprobadaEnTwilio && (
              <input
                id="plantilla-variable" value={nuevaVariable} placeholder={t('plantillas.campo.variableNueva')}
                autoCapitalize="off" autoCorrect="off" spellCheck={false}
                onChange={(e) => setNuevaVariable(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadirVariable(); } }}
                onBlur={anadirVariable}
              />
            )}
            {!aprobadaEnTwilio && (
              <span className="campo-ayuda">{t('plantillas.campo.variablesAyuda', { ejemplo: '{{nombre}}' })}</span>
            )}
          </div>

          {abierta.canal === 'whatsapp' && (
            <section className="twilio">
              <h3>{t('plantillas.twilio.titulo')}</h3>
              <p className="pista">{t('plantillas.twilio.ayuda')}</p>
              <div className="twilio-estados">
                {abierta.content_sid_en
                  ? <>{pillContent(abierta.content_estado, 'es')}{pillContent(abierta.content_estado_en, 'en')}</>
                  : pillContent(abierta.content_estado)}
              </div>
              {abierta.content_motivo && (
                <p className="twilio-motivo">{t('plantillas.twilio.motivo', { motivo: abierta.content_motivo })}</p>
              )}
              {abierta.content_motivo_en && abierta.content_motivo_en !== abierta.content_motivo && (
                <p className="twilio-motivo">{t('plantillas.twilio.motivo', { motivo: abierta.content_motivo_en })}</p>
              )}
              {/* Disabled only while its own call is in flight, never for a
                  dirty form: it reads the SAVED row's state at Twilio. */}
              <button type="button" className="kit-btn kit-btn-ghost" disabled={consultando} onClick={consultarTwilio}>
                {consultando ? t('plantillas.twilio.consultando') : t('plantillas.twilio.consultar')}
              </button>
            </section>
          )}
        </EditSheet>
      )}
    </section>
  );
}
