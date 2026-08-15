import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import {
  ETAPAS, etiquetaCanal, etiquetaEnvio, type Actividad, type Etapa, type Lead, type Propiedad,
  anotar, coincideLead, desatendido, enviarEmail, haceCuanto, loadActividades, loadLeads,
  loadPropiedades, moverLead, onLeadsChange, porPrioridad, registrarContacto, setPrioridad, waLink,
} from './api';

export default function Kanban() {
  const { locale, t } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nota, setNota] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Actividad[]>([]);
  const [email, setEmail] = useState<{ lead: Lead; asunto: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState('');
  // Filtros en estado propio (no derivados de los datos): la recarga por SSE
  // reemplaza `leads` sin tocar lo que la agente tiene seleccionado/escrito.
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [filtroProp, setFiltroProp] = useState(''); // '' = todas, 'sin' = sin propiedad, o id
  const [busqueda, setBusqueda] = useState('');
  // Which column a phone is looking at. On a laptop every column is visible and
  // this changes nothing — the switch is a CSS media query, so the desktop
  // board is untouched by it.
  const [etapaMovil, setEtapaMovil] = useState<Etapa>(ETAPAS[0]);

  const recargar = () => loadLeads().then(setLeads).catch(() => {});
  useEffect(() => { recargar(); return onLeadsChange(recargar); }, []);
  useEffect(() => { loadPropiedades().then(setPropiedades).catch(() => {}); }, []);

  // El filtrado es 100% en cliente sobre la ventana que ya trae loadLeads.
  const visibles = leads.filter((l) =>
    (filtroProp === '' || (filtroProp === 'sin' ? !l.propiedad : l.propiedad === filtroProp)) &&
    coincideLead(l, busqueda));

  const cambiarPrioridad = async (l: Lead, n: number) => {
    await setPrioridad(l.id, l.prioridad === n ? null : n); // repetir el valor la quita
    recargar();
  };

  // Ref del lead abierto: descarta respuestas de cargas que llegan tarde,
  // para que el panel nunca muestre el historial de otro lead.
  const abiertoRef = useRef<string | null>(null);
  const abrir = (id: string | null) => { abiertoRef.current = id; setAbierto(id); };
  const cargarHistorial = async (id: string) => {
    const acts = await loadActividades(id).catch(() => []);
    if (abiertoRef.current === id) setHistorial(acts);
  };

  const verHistorial = async (l: Lead) => {
    if (abierto === l.id) { abrir(null); return; }
    setHistorial([]);
    abrir(l.id);
    await cargarHistorial(l.id);
  };

  // Registramos el contacto que la agente inicia; abrir la app la hace el <a>.
  const contactar = async (l: Lead, canal: 'llamada' | 'whatsapp') => {
    await registrarContacto(l.id, canal,
      canal === 'whatsapp' ? t('contacto.whatsapp') : t('contacto.llamada'));
    recargar();
    if (abierto === l.id) await cargarHistorial(l.id);
  };

  const mover = async (l: Lead, dir: 1 | -1) => {
    const i = ETAPAS.indexOf(l.etapa) + dir;
    if (i < 0 || i >= ETAPAS.length) return;
    await moverLead(l.id, ETAPAS[i]);
    recargar();
  };

  const guardarNota = async (l: Lead) => {
    const texto = nota[l.id]?.trim();
    if (!texto) return;
    try {
      await anotar(l.id, texto);
    } catch {
      setAviso(t('lead.notaError', { nombre: l.nombre }));
      return;
    }
    setNota((n) => ({ ...n, [l.id]: '' }));
    // Cargamos antes de abrir para no enseñar el historial de otro lead.
    const acts = await loadActividades(l.id).catch(() => []);
    abrir(l.id);
    setHistorial(acts);
  };

  const mandarEmail = async () => {
    if (!email) return;
    setAviso(t('email.enviando'));
    try {
      await enviarEmail(email.lead, email.asunto, email.texto);
      setAviso(t('email.enviado', { nombre: email.lead.nombre }));
      setEmail(null);
      recargar();
    } catch (err) {
      setAviso(t('email.error', { error: (err as Error).message }));
    }
  };

  return (
    <>
      {aviso && <p role="status" className="aviso aviso-ok">{aviso}</p>}

      {email && (
        <div className="compositor">
          <h2>{t('email.titulo', { nombre: email.lead.nombre })} <span className="dest">&lt;{email.lead.email}&gt;</span></h2>
          <label>{t('email.asunto')}
            <input value={email.asunto} onChange={(e) => setEmail({ ...email, asunto: e.target.value })} />
          </label>
          <label>{t('email.mensaje')}
            <textarea rows={6} value={email.texto} onChange={(e) => setEmail({ ...email, texto: e.target.value })} />
          </label>
          <div className="botones">
            <button className="primario" onClick={mandarEmail} disabled={!email.asunto || !email.texto}>{t('email.enviar')}</button>
            <button onClick={() => setEmail(null)}>{t('email.cancelar')}</button>
          </div>
        </div>
      )}

      <div className="filtros">
        <select value={filtroProp} onChange={(e) => setFiltroProp(e.target.value)} aria-label={t('filtros.propiedad')}>
          <option value="">{t('filtros.todas')}</option>
          <option value="sin">{t('filtros.sinPropiedad')}</option>
          {propiedades.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
        <input type="search" placeholder={t('filtros.buscar')} value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)} aria-label={t('filtros.buscarAria')} />
      </div>

      {/* The pipeline on a phone: pick a stage, read one column. A board that
          scrolls sideways hides the stage you are not looking at behind a
          gesture nobody discovers. */}
      <div className="etapas-movil" role="tablist" aria-label={t('filtros.etapaAria')}>
        {ETAPAS.map((etapa) => {
          const n = visibles.filter((l) => l.etapa === etapa).length;
          return (
            <button
              key={etapa}
              role="tab"
              aria-selected={etapaMovil === etapa}
              className={`etapa-chip${etapaMovil === etapa ? ' activa' : ''}`}
              onClick={() => setEtapaMovil(etapa)}
            >
              {t(`etapa.${etapa}`)} <span className="n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="kanban" data-etapa={etapaMovil}>
        {ETAPAS.map((etapa) => (
          <section key={etapa} className={`col col-${etapa}`}>
            <h2>{t(`etapa.${etapa}`)} <span className="n">{visibles.filter((l) => l.etapa === etapa).length}</span></h2>
            {visibles.filter((l) => l.etapa === etapa).sort(porPrioridad).map((l) => (
              <article key={l.id} className={`lead${desatendido(l) ? ' desatendido' : ''}`}>
                <strong>{l.nombre}</strong>
                <div className="prioridad" role="group" aria-label={t('lead.prioridadAria', { nombre: l.nombre })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={l.prioridad === n ? 'activa' : ''}
                      aria-pressed={l.prioridad === n}
                      title={l.prioridad === n ? t('lead.quitarPrioridad') : t('lead.prioridadN', { n })}
                      onClick={() => cambiarPrioridad(l, n)}>{n}</button>
                  ))}
                  {!l.prioridad && <span className="sin" title={t('lead.sinPrioridad')}>—</span>}
                </div>
                {l.expand?.propiedad && <span className="prop">🏠 {l.expand.propiedad.titulo}</span>}
                <button className="seguimiento" onClick={() => verHistorial(l)} title={t('lead.historial')}>
                  {desatendido(l) ? '⚠ ' : ''}{haceCuanto(locale, l.ultimo_contacto)}
                </button>
                {l.mensaje && <p className="msg">“{l.mensaje}”</p>}

                {abierto === l.id && (
                  <ul className="historial">
                    {historial.length === 0 && <li className="vacio">{t('lead.sinContactos')}</li>}
                    {historial.map((a) => (
                      <li key={a.id}>
                        <span>{etiquetaCanal(locale, a.tipo)}</span>
                        <span className="cuando">{haceCuanto(locale, a.created)}</span>
                        {a.estado_envio && etiquetaEnvio(locale, a.estado_envio) && (
                          <span className={`envio envio-${a.estado_envio}`}>{etiquetaEnvio(locale, a.estado_envio)}</span>
                        )}
                        {a.asunto && <span className="asunto">{a.asunto}</span>}
                        {a.nota && <span className="texto">{a.nota}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="acciones">
                  {l.telefono && <a href={`tel:${l.telefono}`} onClick={() => contactar(l, 'llamada')}>📞</a>}
                  {waLink(l) && (
                    <a href={waLink(l)} target="_blank" rel="noreferrer" onClick={() => contactar(l, 'whatsapp')}>
                      💬 WhatsApp
                    </a>
                  )}
                  {l.email && (
                    <button className="enlace" onClick={() => setEmail({
                      lead: l,
                      asunto: l.expand?.propiedad
                        ? t('email.asuntoPropiedad', { propiedad: l.expand.propiedad.titulo })
                        : t('email.asuntoGenerico'),
                      texto: t('email.plantilla', {
                        nombre: l.nombre,
                        propiedad: l.expand?.propiedad
                          ? t('email.plantillaPropiedad', { propiedad: l.expand.propiedad.titulo }) : '',
                      }),
                    })}>✉️ Email</button>
                  )}
                </div>

                <div className="mover">
                  <button onClick={() => mover(l, -1)} disabled={l.etapa === ETAPAS[0]} aria-label={t('lead.etapaAnterior')}>←</button>
                  <button onClick={() => mover(l, 1)} disabled={l.etapa === ETAPAS[ETAPAS.length - 1]} aria-label={t('lead.etapaSiguiente')}>→</button>
                </div>
                <div className="notas">
                  <input placeholder={t('lead.nota')} value={nota[l.id] ?? ''}
                    onChange={(e) => setNota((n) => ({ ...n, [l.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && guardarNota(l)} />
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
