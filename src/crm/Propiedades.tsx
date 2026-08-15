import { useI18n } from '../lib/LocaleContext';
import { useSettings } from '../lib/SettingsContext';
import { monedaDe } from '../lib/settings';
import { SidePanel } from '../components/kit/SidePanel';
import { useEffect, useRef, useState } from 'react';
import { useList, useRemoteList } from '../lib/useList';
import { Pager } from '../components/Pager';
import {
  type Propiedad, type Propietario, loadPropiedades, loadPropietarios, buscarPropiedades,
  crearPropiedad, actualizarPropiedad, fotoUrl, fotosUrls, quitarFoto, normalizaFoto, fmtPrecio,
} from './api';

export default function Propiedades() {
  const { locale, t } = useI18n();
  const moneda = monedaDe(useSettings().settings);
  const [owners, setOwners] = useState<Propietario[]>([]);
  const [form, setForm] = useState<'cerrado' | 'nueva' | Propiedad>('cerrado');
  const [enviando, setEnviando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The property being looked at, as an id: the record itself is read back from
  // the list on every render, so publishing or editing it updates the panel
  // without a second copy that can disagree.
  const [fichaId, setFichaId] = useState<string | null>(null);

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
  const ficha = fichaId ? (props.find((p) => p.id === fichaId) ?? null) : null;
  const pagina = useList(props, { fields: ['titulo', 'municipio', 'direccion'], size: 12 });

  const editando = typeof form === 'object' ? form : null;

  const recargar = () => {
    remoto.reload();
    loadPropietarios().then(setOwners);
  };
  useEffect(() => { loadPropietarios().then(setOwners); }, []);

  // Un fallo de la búsqueda se cuenta igual que antes: en la misma línea de
  // aviso que el resto de la pantalla, no en un hueco propio.
  useEffect(() => {
    if (remoto.error) setMsg({ tipo: 'error', texto: t('prop.errorBuscar', { error: remoto.error.message }) });
  }, [remoto.error, t]);

  // Al abrir en modo edición, lleva el formulario a la vista (la card
  // pulsada puede estar muy abajo en la rejilla).
  useEffect(() => {
    if (typeof form === 'object') {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [form]);

  const publicar = async (p: Propiedad) => {
    try {
      await actualizarPropiedad(p.id, { estado: p.estado === 'publicada' ? 'borrador' : 'publicada' });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: t('prop.errorEstado', { error: (err as Error).message }) });
    }
  };

  // Borrar una foto es un PATCH inmediato ('fotos-') e irreversible: PocketBase
  // elimina el fichero del disco, de ahí el confirm. El form sigue abierto y la
  // tira se refresca con el record que devuelve el PATCH (misma key → los
  // campos a medio editar no se pierden).
  const borrarFoto = async (p: Propiedad, nombre: string) => {
    if (borrando) return; // un borrado a la vez: dos PATCH concurrentes pueden llegar desordenados
    if (!confirm(t('prop.confirmarFoto'))) return;
    setMsg(null);
    setBorrando(nombre);
    try {
      const actualizada = await quitarFoto(p.id, nombre);
      // Solo si esa propiedad sigue abierta: si mientras llegaba la respuesta
      // se cerró el form o se abrió otra, no hay que reabrirlo ni pisarla.
      setForm((f) => (typeof f === 'object' && f.id === actualizada.id ? actualizada : f));
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: t('prop.errorFoto', { error: (err as Error).message }) });
    } finally {
      setBorrando(null);
    }
  };

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando || borrando) return; // doble submit duplicaría fotos ('fotos+'); con un borrado en vuelo, dos PATCH tocarían el mismo record
    const el = e.currentTarget;
    const raw = new FormData(el);
    setMsg(null);
    setEnviando(true);
    try {
      const texto = (k: string) => String(raw.get(k) ?? '').trim();
      const payload: Record<string, unknown> = { titulo: texto('titulo') };
      if (editando) {
        // PATCH: hay que enviar también los campos vacíos ('' limpia texto,
        // null limpia numéricos); si se omiten, un valor borrado en el form
        // persistiría silenciosamente en el backend. No se toca `estado`.
        for (const k of ['municipio', 'direccion', 'descripcion', 'propietario'] as const) {
          payload[k] = texto(k);
        }
        for (const k of ['precio', 'habitaciones', 'banos', 'superficie'] as const) {
          const v = Number(texto(k));
          payload[k] = texto(k) === '' || Number.isNaN(v) ? null : v;
        }
      } else {
        // Alta: payload explícito, solo campos con valor (un multipart con
        // partes vacías es justo lo que hacía tropezar al backend).
        payload.estado = 'borrador';
        for (const k of ['municipio', 'direccion', 'descripcion', 'propietario'] as const) {
          if (texto(k)) payload[k] = texto(k);
        }
        for (const k of ['precio', 'habitaciones', 'banos', 'superficie'] as const) {
          const v = texto(k) === '' ? undefined : Number(texto(k));
          if (v !== undefined && !Number.isNaN(v)) payload[k] = v;
        }
      }

      const brutas = (raw.getAll('fotos') as File[]).filter((f) => f && f.size > 0);
      if (brutas.length === 0) {
        if (editando) await actualizarPropiedad(editando.id, payload); // sin fotos → JSON puro
        else await crearPropiedad(payload);
      } else {
        setMsg({ tipo: 'ok', texto: t('prop.preparandoFotos') });
        const fotos = await Promise.all(brutas.map(normalizaFoto));
        const fd = new FormData();
        if (editando) {
          // PATCH multipart: los campos van en '@jsonPayload' (PocketBase lo
          // fusiona como JSON) para conservar los null que limpian numéricos —
          // como parte multipart vacía tropezarían con el backend.
          fd.append('@jsonPayload', JSON.stringify(payload));
        } else {
          for (const [k, v] of Object.entries(payload)) fd.append(k, String(v));
        }
        // En edición las fotos nuevas se AÑADEN ('fotos+', sintaxis de
        // PocketBase); 'fotos' a secas en un PATCH reemplazaría el set entero.
        for (const f of fotos) fd.append(editando ? 'fotos+' : 'fotos', f, f.name);
        if (editando) await actualizarPropiedad(editando.id, fd);
        else await crearPropiedad(fd);
      }
      el.reset();
      setForm('cerrado');
      setMsg({
        tipo: 'ok',
        texto: editando
          ? t('prop.actualizada', { titulo: String(payload.titulo) })
          : t('prop.guardada', { titulo: String(payload.titulo) }),
      });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: t('prop.errorGuardar', { error: (err as Error).message }) });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="barra">
        <h1>{t('prop.titulo')}</h1>
        <input type="search" className="buscador" placeholder={t('prop.buscar')}
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label={t('prop.buscarAria')} />
        <button className="primario" onClick={() => setForm(form === 'cerrado' ? 'nueva' : 'cerrado')}>
          {form === 'cerrado' ? t('prop.nueva') : t('prop.cancelar')}
        </button>
      </div>
      {msg && <p role="status" className={`aviso aviso-${msg.tipo}`}>{msg.texto}</p>}

      {form !== 'cerrado' && (
        <form
          ref={formRef}
          // owners.length en la key: si se abre en edición antes de que
          // carguen los propietarios, el select remonta con su defaultValue
          // ya resoluble (si no, quedaría en "—" y al guardar desvincularía).
          key={`${editando ? editando.id : 'nueva'}-${owners.length}`}
          className="alta"
          onSubmit={guardar}
        >
          <h2>{editando ? t('prop.editarTitulo', { titulo: editando.titulo }) : t('prop.nuevaTitulo')}</h2>
          <div className="fila2">
            <label>{t('prop.campo.titulo')} <input name="titulo" required defaultValue={editando?.titulo ?? ''} /></label>
            <label>{t('prop.campo.municipio')} <input name="municipio" defaultValue={editando?.municipio ?? ''} /></label>
            <label>{t('prop.campo.direccion')} <input name="direccion" defaultValue={editando?.direccion ?? ''} /></label>
          </div>
          <div className="fila">
            <label>{t('prop.campo.precio')} <input name="precio" type="number" min="0" defaultValue={editando?.precio ?? ''} /></label>
            <label>{t('prop.campo.habitaciones')} <input name="habitaciones" type="number" min="0" defaultValue={editando?.habitaciones ?? ''} /></label>
            <label>{t('prop.campo.banos')} <input name="banos" type="number" min="0" defaultValue={editando?.banos ?? ''} /></label>
            <label>{t('prop.campo.superficie')} <input name="superficie" type="number" min="0" defaultValue={editando?.superficie ?? ''} /></label>
          </div>
          <label>{t('prop.campo.descripcion')} <textarea name="descripcion" rows={3} defaultValue={editando?.descripcion ?? ''} /></label>
          <label>{t('prop.campo.propietario')}
            <select name="propietario" defaultValue={editando?.propietario ?? ''}>
              <option value="">—</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          {editando && (
            <div className="fotos-actuales">
              <span className="pista">
                {editando.fotos?.length
                  ? t('prop.fotos', { count: editando.fotos.length })
                  : t('prop.sinFotos')}
              </span>
              {(editando.fotos?.length ?? 0) > 0 && (
                <ul className="tira-fotos">
                  {editando.fotos.map((nombre, i) => (
                    <li key={nombre}>
                      <img src={fotosUrls(editando)[i]} alt={t('prop.fotoAlt', { n: i + 1, titulo: editando.titulo })} loading="lazy" />
                      <button
                        type="button"
                        className="quitar-foto"
                        disabled={enviando || borrando !== null}
                        aria-label={t('prop.eliminarFoto', { n: i + 1 })}
                        title={t('prop.eliminarFotoTitle')}
                        onClick={() => borrarFoto(editando, nombre)}
                      >✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <label>{t('prop.campo.fotos')} <input name="fotos" type="file" accept="image/*" multiple />
            {editando && <span className="pista">{t('prop.fotosNuevas')}</span>}
          </label>
          <div className="acciones">
            <button className="primario" type="submit" disabled={enviando || borrando !== null}>
              {enviando ? t('prop.guardando') : t('prop.guardar')}
            </button>
            <button type="button" disabled={enviando} onClick={() => setForm('cerrado')}>{t('prop.cancelar')}</button>
          </div>
        </form>
      )}

      {busqueda.trim().length >= 2 && props.length === 0 && (
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
                <span className="n-fotos" title={t('prop.fotos', { count: p.fotos.length })}>
                  📷 {p.fotos.length}
                </span>
              </div>
            ) : <div className="sinfoto">📷</div>}
            {/* One way in, like every other list in this CRM. Publishing and
                editing are decisions about a property, and you take them
                looking at the property — not from a grid tile. */}
            <button className="cuerpo" onClick={() => setFichaId(p.id)}>
              <strong>{p.titulo}</strong>
              <span className="meta">{t('prop.meta', { municipio: p.municipio, rooms: p.habitaciones ?? '–', area: p.superficie ?? '–' })}</span>
              <span className="precio">{fmtPrecio(locale, p.precio, moneda)}</span>
              <span className={`estado estado-${p.estado}`}>{t(`estadoProp.${p.estado}`)}</span>
            </button>
          </article>
        ))}
      </div>

      {/* Doce fichas por pantalla: la rejilla completa de una inmobiliaria en
          marcha es un scroll infinito en el que nadie encuentra nada. */}
      <Pager page={pagina} onPage={pagina.setPage} />

      {ficha && (
        <SidePanel
          open
          onClose={() => setFichaId(null)}
          title={ficha.titulo}
          subtitle={t('prop.meta', {
            municipio: ficha.municipio, rooms: ficha.habitaciones ?? '–', area: ficha.superficie ?? '–',
          })}
          footer={(
            <>
              {(ficha.estado === 'borrador' || ficha.estado === 'publicada') && (
                <button className="kit-btn kit-btn-ghost" onClick={() => publicar(ficha)}>
                  {ficha.estado === 'publicada' ? t('prop.retirar') : t('prop.publicar')}
                </button>
              )}
              <button className="kit-btn kit-btn-primary" onClick={() => { setForm(ficha); setFichaId(null); }}>
                {t('prop.editar')}
              </button>
            </>
          )}
        >
          <p className="ficha-precio">{fmtPrecio(locale, ficha.precio, moneda)}</p>
          <p className={`estado estado-${ficha.estado}`}>{t(`estadoProp.${ficha.estado}`)}</p>
          {ficha.direccion && <p className="ficha-dir">{ficha.direccion}</p>}
          {ficha.descripcion && <p className="ficha-desc">{ficha.descripcion}</p>}

          <h3>{t('prop.campo.fotos')}</h3>
          {fotosUrls(ficha).length === 0 && <p className="vacio">{t('prop.sinFotos')}</p>}
          <div className="ficha-fotos">
            {fotosUrls(ficha).map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
          </div>
        </SidePanel>
      )}
    </div>
  );
}
