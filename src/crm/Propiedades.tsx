import { useI18n } from '../lib/LocaleContext';
import { useSettings } from '../lib/SettingsContext';
import { monedaDe } from '../lib/settings';
import { SidePanel } from '../components/kit/SidePanel';
import { EditSheet } from '../components/kit/EditSheet';
import { useEffect, useState } from 'react';
import { useList, useRemoteList } from '../lib/useList';
import { ListStatus, Pager } from '../components/Pager';
import { IconCamera, IconClose } from '../components/kit/Icono';
import { Popover, Select, Tooltip, useToast } from '../components/ui';
import { OwnerDialog } from './OwnerDialog';
import { EMPTY_FIELDS, canSave, fieldsOf, payloadOf, type PropertyFields } from './property-form';
import {
  ESTADOS_PROPIEDAD, type EstadoPropiedad, type Propiedad, type Propietario,
  loadPropiedades, loadPropietarios, buscarPropiedades,
  crearPropiedad, actualizarPropiedad, fotoUrl, fotosUrls, quitarFoto, normalizaFoto, fmtPrecio,
} from './api';

// One panel, three modes. A property is read where it is read, edited where it
// is read, and created in the same shape — which is what the lead board has
// always done and this screen did not: editing used to close the record and
// unfold a form over the grid, so the agent lost the thing they were editing
// and had to find it again on the way back.
type Panel = { modo: 'ficha' | 'editar'; id: string } | { modo: 'nueva' } | null;

/** The owner picker's "add one now" row. Never a value that reaches the record. */
const NUEVO_PROPIETARIO = '__nuevo__';

export default function Propiedades() {
  const { locale, t } = useI18n();
  const moneda = monedaDe(useSettings().settings);
  const [owners, setOwners] = useState<Propietario[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [campos, setCampos] = useState<PropertyFields>(EMPTY_FIELDS);
  const [enviando, setEnviando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [nuevoPropietario, setNuevoPropietario] = useState(false);
  // Outcomes go to a toast: announced, gone by themselves, never a bar that
  // pushes the grid down and stays until somebody notices it is stale.
  const toast = useToast();
  const avisar = (tipo: 'ok' | 'error', texto: string) => toast({ title: texto, tone: tipo });
  // A failure of the panel's own action is ALSO said inside the panel: an open
  // sheet hides the toasts from assistive technology.
  const [panelError, setPanelError] = useState<string | null>(null);

  // Buscar y paginar salen del brick `list`: la guarda de respuestas
  // desordenadas, el rebote del teclado y el recorte de la página vivían aquí
  // escritos a mano, y son exactamente los cuatro fallos que ese brick existe
  // para evitar — el mismo que ocultó 26 leads durante semanas.
  const remoto = useRemoteList<Propiedad>(
    (q) => (q ? buscarPropiedades(q) : loadPropiedades()),
    { minChars: 2 },
  );
  const busqueda = remoto.query;
  const setBusqueda = remoto.setQuery;
  const props = remoto.items;
  const pagina = useList(props, { fields: ['titulo', 'municipio', 'direccion'], size: 12 });

  // The record a mutation just returned. The list is the source of truth, but
  // it reloads asynchronously: without this the panel would blink shut after
  // creating a property, and a photo just uploaded would take a round trip to
  // appear. It is dropped when the panel closes, so it can never go stale.
  const [fresco, setFresco] = useState<Propiedad | null>(null);
  const abiertoId = panel && 'id' in panel ? panel.id : null;
  const ficha = abiertoId
    ? (fresco?.id === abiertoId ? fresco : props.find((p) => p.id === abiertoId) ?? null)
    : null;

  // The one-line summary of a property. Only what is known: a missing count
  // is left out rather than shown as a dash pretending to be a number.
  const metaDe = (p: Propiedad) => [
    p.municipio,
    p.habitaciones != null && p.habitaciones > 0 && t('prop.meta.rooms', { n: p.habitaciones }),
    p.superficie != null && p.superficie > 0 && t('prop.meta.area', { n: p.superficie }),
  ].filter(Boolean).join(' · ');

  const recargar = () => {
    remoto.reload();
    loadPropietarios().then(setOwners);
  };
  useEffect(() => { loadPropietarios().then(setOwners); }, []);

  useEffect(() => {
    // One toast, replaced in place: a search that fails on every keystroke is
    // one error, not a stack of them.
    if (remoto.error) toast({ id: 'prop-search', tone: 'error', title: t('prop.errorBuscar', { error: remoto.error.message }) });
  }, [remoto.error, t, toast]);

  const cerrarPanel = () => { setPanel(null); setPanelError(null); setFresco(null); };
  // Opening seeds `fresco` with the record that was clicked, so the panel never
  // depends on the list staying still underneath it: a search answer landing
  // while a record is open used to be able to drop that row and close the
  // panel with no explanation.
  const verFicha = (p: Propiedad) => { setFresco(p); setPanel({ modo: 'ficha', id: p.id }); setPanelError(null); };
  const editar = (p: Propiedad) => {
    setCampos(fieldsOf(p));
    setPanelError(null);
    setPanel({ modo: 'editar', id: p.id });
  };
  const nueva = () => {
    setCampos(EMPTY_FIELDS);
    setPanelError(null);
    setFresco(null);
    setPanel({ modo: 'nueva' });
  };
  const set = <K extends keyof PropertyFields>(k: K) => (v: string) =>
    setCampos((c) => ({ ...c, [k]: v }));

  // -- the record's own decisions, taken while reading it ----------------------

  // One write at a time on the open record. Without it, pressing a status
  // button on a slow link looks like nothing happened, the agent presses
  // again, and two PATCHes race: whichever answers last wins the panel, which
  // can be the older one. The photo handlers already worked this way.
  const [escribiendo, setEscribiendo] = useState(false);
  const ocupado = escribiendo || subiendo || borrando !== null;

  const cambiarEstado = async (p: Propiedad, estado: EstadoPropiedad) => {
    if (p.estado === estado || ocupado) return;
    setEscribiendo(true);
    try {
      setFresco(await actualizarPropiedad(p.id, { estado }));
      setPanelError(null);
      recargar();
      avisar('ok', t('prop.estadoCambiado', { estado: t(`estadoProp.${estado}`) }));
    } catch (err) {
      const msg = t('prop.errorEstado', { error: (err as Error).message });
      setPanelError(msg);
      avisar('error', msg);
    } finally {
      setEscribiendo(false);
    }
  };

  const [precioAbierto, setPrecioAbierto] = useState(false);
  const [precioValor, setPrecioValor] = useState('');
  const abrirPrecio = (p: Propiedad) => {
    setPrecioValor(fieldsOf(p).precio);
    setPrecioAbierto(true);
  };
  const guardarPrecio = async (p: Propiedad) => {
    if (ocupado) return;
    const raw = precioValor.trim();
    const n = Number(raw);
    setEscribiendo(true);
    try {
      setFresco(await actualizarPropiedad(p.id, { precio: raw === '' || Number.isNaN(n) ? null : n }));
      setPrecioAbierto(false);
      setPanelError(null);
      recargar();
    } catch (err) {
      const msg = t('prop.errorGuardar', { error: (err as Error).message });
      setPanelError(msg);
      avisar('error', msg);
    } finally {
      setEscribiendo(false);
    }
  };

  // Photos belong to the record, not to the form: they are added and removed
  // while looking at the property, which is also why saving is plain JSON now
  // and the multipart-with-fields path is gone.
  const subirFotos = async (p: Propiedad, elegidas: File[]) => {
    if (!elegidas.length || ocupado) return;
    setSubiendo(true);
    // Progress, gone the moment the outcome arrives (see `finally`).
    toast({ id: 'prop-fotos', title: t('prop.preparandoFotos') });
    try {
      const fotos = await Promise.all(elegidas.map((f) => normalizaFoto(f, locale)));
      const fd = new FormData();
      // 'fotos+' APPENDS (PocketBase syntax); a plain 'fotos' in a PATCH would
      // replace the whole set and delete the files already there.
      for (const f of fotos) fd.append('fotos+', f, f.name);
      setFresco(await actualizarPropiedad(p.id, fd));
      setPanelError(null);
      recargar();
      avisar('ok', t('prop.fotosSubidas', { count: fotos.length }));
    } catch (err) {
      const msg = t('prop.errorSubirFotos', { error: (err as Error).message });
      setPanelError(msg);
      avisar('error', msg);
    } finally {
      toast.dismiss('prop-fotos');
      setSubiendo(false);
    }
  };

  // Borrar una foto es un PATCH inmediato ('fotos-') e irreversible: PocketBase
  // elimina el fichero del disco, de ahí el confirm.
  const borrarFoto = async (p: Propiedad, nombre: string) => {
    if (ocupado) return; // un borrado a la vez: dos PATCH concurrentes pueden llegar desordenados
    if (!confirm(t('prop.confirmarFoto'))) return;
    setBorrando(nombre);
    try {
      setFresco(await quitarFoto(p.id, nombre));
      setPanelError(null);
      recargar();
    } catch (err) {
      const msg = t('prop.errorFoto', { error: (err as Error).message });
      setPanelError(msg);
      avisar('error', msg);
    } finally {
      setBorrando(null);
    }
  };

  // -- the form ----------------------------------------------------------------

  const guardar = async () => {
    if (enviando || !panel || panel.modo === 'ficha') return;
    // `required` on the title catches an empty box and focuses it, but it
    // accepts a box full of spaces; this catches that and says so where the
    // browser cannot.
    if (!canSave(campos)) {
      setPanelError(t('prop.faltaTitulo'));
      return;
    }
    const editando = panel.modo === 'editar' ? ficha : null;
    if (panel.modo === 'editar' && !editando) {
      // The record went away under the form. Saying nothing would leave the
      // agent pressing an enabled button at a silent app.
      avisar('error', t('prop.errorDesaparecida'));
      cerrarPanel();
      return;
    }
    setEnviando(true);
    setPanelError(null);
    const payload = payloadOf(campos, !!editando);
    try {
      const guardada = editando
        ? await actualizarPropiedad(editando.id, payload)
        : await crearPropiedad(payload);
      setFresco(guardada);
      // Back to the record, never to the grid: the next thing an agent does
      // with a property they just described is add its photos.
      setPanel({ modo: 'ficha', id: guardada.id });
      recargar();
      avisar('ok', editando
        ? t('prop.actualizada', { titulo: String(payload.titulo) })
        : t('prop.guardada', { titulo: String(payload.titulo) }));
    } catch (err) {
      const msg = t('prop.errorGuardar', { error: (err as Error).message });
      setPanelError(msg);
      avisar('error', msg);
    } finally {
      setEnviando(false);
    }
  };

  // "Add one" goes ABOVE the owners, not after them: this agency has two
  // hundred, so at the bottom of the list it is a row nobody ever scrolls to.
  const opcionesPropietario = [
    { value: '', label: t('prop.sinPropietario') },
    { value: NUEVO_PROPIETARIO, label: t('propietario.nuevo') },
    ...owners.map((o) => ({ value: o.id, label: o.nombre })),
  ];
  const nombrePropietario = (id: string) => owners.find((o) => o.id === id)?.nombre ?? '';

  const editando = panel?.modo === 'editar';
  const enFormulario = panel?.modo === 'editar' || panel?.modo === 'nueva';

  return (
    <div>
      <div className="barra">
        <h1>{t('prop.titulo')}</h1>
        <input type="search" className="buscador" placeholder={t('prop.buscar')}
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label={t('prop.buscarAria')} />
        <button className="primario" onClick={nueva}>{t('prop.nueva')}</button>
      </div>

      {/* Loading and empty come from the list brick; "no results" keeps its own
          words because it names the search. */}
      <ListStatus loading={remoto.loading} empty={!remoto.loading && !remoto.error && props.length === 0 && busqueda.trim().length < 2} />
      {!remoto.loading && busqueda.trim().length >= 2 && props.length === 0 && (
        <p className="sin-resultados">{t('prop.sinResultados', { q: busqueda.trim() })}</p>
      )}

      <div className="grid">
        {pagina.items.map((p) => (
          <article key={p.id} className="ficha">
            {fotoUrl(p) ? (
              <div className="portada">
                <img src={fotoUrl(p)} alt="" />
                {/* La portada (fotos[0]) no cambia al añadir fotos ('fotos+'
                    las pone al final); el contador sí, y es el feedback de
                    que la subida funcionó. */}
                <span className="n-fotos" data-num title={t('prop.fotos', { count: p.fotos.length })}>
                  <IconCamera size={12} /> {p.fotos.length}
                </span>
              </div>
            ) : <div className="sinfoto" aria-hidden="true"><IconCamera size={32} /></div>}
            {/* One way in, like every other list in this CRM. Publishing and
                editing are decisions about a property, and you take them
                looking at the property — not from a grid tile. */}
            <button className="cuerpo" onClick={() => verFicha(p)}>
              <strong>{p.titulo}</strong>
              <span className="meta">{metaDe(p)}</span>
              <span className="precio">{fmtPrecio(locale, p.precio, moneda)}</span>
              <span className={`estado estado-${p.estado}`}>{t(`estadoProp.${p.estado}`)}</span>
            </button>
          </article>
        ))}
      </div>

      {/* Doce fichas por pantalla: la rejilla completa de una inmobiliaria en
          marcha es un scroll infinito en el que nadie encuentra nada. */}
      <Pager page={pagina} onPage={pagina.setPage} />

      {/* The record. Price, status and photos are edited here, in place: they
          are single decisions, and a form is a bad way to ask for one. */}
      {ficha && panel?.modo === 'ficha' && (
        <SidePanel
          open
          onClose={cerrarPanel}
          title={ficha.titulo}
          subtitle={metaDe(ficha)}
          error={panelError}
          footer={(
            <button className="kit-btn kit-btn-primary" onClick={() => editar(ficha)}>
              {t('prop.editar')}
            </button>
          )}
        >
          <Popover
            open={precioAbierto}
            onOpenChange={(o) => (o ? abrirPrecio(ficha) : setPrecioAbierto(false))}
            title={t('prop.campo.precio')}
            trigger={(
              // With no price the headline number would be a lonely dash: it
              // says the right thing on a card, in a column of cards, and
              // nothing at all where it is also the way to set one.
              <button
                type="button"
                className={ficha.precio ? 'ficha-precio' : 'ficha-precio vacio'}
                // `aria-label` REPLACES the content for assistive technology,
                // so a bare "edit the price" made the price itself unreadable
                // — it appears nowhere else in the panel — and left the empty
                // state saying one thing and announcing another.
                aria-label={t('prop.precioEditarValor', {
                  precio: ficha.precio ? fmtPrecio(locale, ficha.precio, moneda) : t('prop.sinPrecio'),
                })}
              >
                {ficha.precio ? fmtPrecio(locale, ficha.precio, moneda) : t('prop.sinPrecio')}
              </button>
            )}
          >
            <form
              className="precio-form"
              onSubmit={(e) => { e.preventDefault(); guardarPrecio(ficha); }}
            >
              <input
                type="number" min="0" autoFocus value={precioValor}
                aria-label={t('prop.campo.precio')}
                onChange={(e) => setPrecioValor(e.target.value)}
              />
              <button type="submit" className="kit-btn kit-btn-primary">{t('prop.guardar')}</button>
            </form>
          </Popover>

          <h3>{t('prop.estadoTitulo')}</h3>
          {/* The status IS the publish action, and there are four of them: a
              two-way toggle could not say "reserved" without opening the form. */}
          <div className="estados" role="group" aria-label={t('prop.estadoAria')}>
            {ESTADOS_PROPIEDAD.map((e) => (
              <button
                key={e}
                type="button"
                className={`estado-btn estado-${e}${ficha.estado === e ? ' activa' : ''}`}
                aria-pressed={ficha.estado === e}
                disabled={ocupado}
                onClick={() => cambiarEstado(ficha, e)}
              >
                {t(`estadoProp.${e}`)}
              </button>
            ))}
          </div>

          {ficha.direccion && <p className="ficha-dir">{ficha.direccion}</p>}
          {ficha.descripcion && <p className="ficha-desc">{ficha.descripcion}</p>}
          {nombrePropietario(ficha.propietario) && (
            <p className="ficha-dueno">
              <span>{t('prop.campo.propietario')}</span> {nombrePropietario(ficha.propietario)}
            </p>
          )}

          <h3>{t('prop.campo.fotos')}</h3>
          {fotosUrls(ficha).length === 0 && <p className="vacio">{t('prop.sinFotos')}</p>}
          {fotosUrls(ficha).length > 0 && (
            <ul className="ficha-fotos">
              {ficha.fotos.map((nombre, i) => (
                <li key={nombre}>
                  <img src={fotosUrls(ficha)[i]} alt={t('prop.fotoAlt', { n: i + 1, titulo: ficha.titulo })} loading="lazy" />
                  <Tooltip label={t('prop.eliminarFotoTitle')}>
                    <button
                      type="button"
                      className="quitar-foto"
                      disabled={ocupado}
                      aria-label={t('prop.eliminarFoto', { n: i + 1 })}
                      onClick={() => borrarFoto(ficha, nombre)}
                    ><IconClose /></button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
          <label className="campo">{subiendo ? t('prop.fotosSubiendo') : t('prop.fotosAnadir')}
            <input
              type="file" accept="image/*" multiple disabled={ocupado}
              onChange={(e) => {
                const elegidas = Array.from(e.target.files ?? []);
                e.target.value = ''; // so the same file can be picked again after a failure
                subirFotos(ficha, elegidas);
              }}
            />
          </label>
        </SidePanel>
      )}

      {/* The form, in the same place the record was, with the same anatomy as
          the new-lead panel: fields in one column, one primary, one ghost. */}
      {enFormulario && (
        <EditSheet
          open
          onClose={() => (editando && ficha ? verFicha(ficha) : cerrarPanel())}
          onSubmit={guardar}
          title={editando && ficha ? t('prop.editarTitulo', { titulo: ficha.titulo }) : t('prop.nuevaTitulo')}
          subtitle={editando ? undefined : t('prop.nuevaAyuda')}
          error={panelError}
          busy={enviando}
          saveLabel={t('prop.guardar')}
          busyLabel={t('prop.guardando')}
          cancelLabel={t('prop.cancelar')}
        >
          <label className="campo">{t('prop.campo.titulo')}
            <input value={campos.titulo} required autoFocus onChange={(e) => set('titulo')(e.target.value)} />
          </label>
          <div className="campos-2">
            <label className="campo">{t('prop.campo.municipio')}
              <input value={campos.municipio} onChange={(e) => set('municipio')(e.target.value)} />
            </label>
            <label className="campo">{t('prop.campo.direccion')}
              <input value={campos.direccion} onChange={(e) => set('direccion')(e.target.value)} />
            </label>
          </div>
          <div className="campos-2">
            <label className="campo">{t('prop.campo.precio')}
              <input type="number" min="0" value={campos.precio} onChange={(e) => set('precio')(e.target.value)} />
            </label>
            <label className="campo">{t('prop.campo.superficie')}
              <input type="number" min="0" value={campos.superficie} onChange={(e) => set('superficie')(e.target.value)} />
            </label>
            <label className="campo">{t('prop.campo.habitaciones')}
              <input type="number" min="0" value={campos.habitaciones} onChange={(e) => set('habitaciones')(e.target.value)} />
            </label>
            <label className="campo">{t('prop.campo.banos')}
              <input type="number" min="0" value={campos.banos} onChange={(e) => set('banos')(e.target.value)} />
            </label>
          </div>
          <label className="campo">{t('prop.campo.descripcion')}
            <textarea rows={4} value={campos.descripcion} onChange={(e) => set('descripcion')(e.target.value)} />
          </label>
          <div className="campo">
            <span>{t('prop.campo.propietario')}</span>
            <Select
              value={campos.propietario}
              ariaLabel={t('prop.campo.propietario')}
              options={opcionesPropietario}
              onValueChange={(v) => {
                if (v === NUEVO_PROPIETARIO) setNuevoPropietario(true);
                else set('propietario')(v);
              }}
            />
          </div>
          {/* Photos are not here: they belong to the record and are added from
              it, so a new property is one short form and nothing else. */}
          <p className="pista">{editando ? t('prop.fotosEnFicha') : t('prop.fotosDespues')}</p>
        </EditSheet>
      )}

      <OwnerDialog
        open={nuevoPropietario}
        onClose={() => setNuevoPropietario(false)}
        onCreated={(creado) => {
          setOwners((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
          set('propietario')(creado.id);
          setNuevoPropietario(false);
          avisar('ok', t('propietario.creado', { nombre: creado.nombre }));
        }}
      />
    </div>
  );
}
