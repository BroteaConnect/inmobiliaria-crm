import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { SidePanel } from '../components/kit/SidePanel';
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

  /** Open the record. The history is loaded before the panel appears, so it
   *  never shows the previous lead's contacts for a frame. */
  const ficha = abierto ? (leads.find((l) => l.id === abierto) ?? null) : null;

  const abrirFicha = async (l: Lead) => {
    abrir(l.id);
    setHistorial([]);
    await cargarHistorial(l.id);
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
                {/* The card is the design's list anatomy: signal, name, one line
                    of context, one way in. Everything that used to be crammed
                    under it — the history, the contact buttons, the note box,
                    the five priority digits — is in the panel now, which is
                    where you read a lead instead of squinting at a column. */}
                <button className="lead-abrir" onClick={() => abrirFicha(l)}>
                  <strong>{l.nombre}</strong>
                  <span className="lead-contexto">
                    {desatendido(l) && <span className="lead-alerta">● </span>}
                    {l.expand?.propiedad ? `${l.expand.propiedad.titulo} · ` : ''}
                    {haceCuanto(locale, l.ultimo_contacto)}
                  </span>
                </button>

                <div className="mover">
                  <button onClick={() => mover(l, -1)} disabled={l.etapa === ETAPAS[0]} aria-label={t('lead.etapaAnterior')}>←</button>
                  <button onClick={() => mover(l, 1)} disabled={l.etapa === ETAPAS[ETAPAS.length - 1]} aria-label={t('lead.etapaSiguiente')}>→</button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>

      {/* The record, beside the board rather than instead of it. */}
      {ficha && (
        <SidePanel
          open
          onClose={() => abrir(null)}
          title={ficha.nombre}
          subtitle={ficha.expand?.propiedad?.titulo ?? t('filtros.sinPropiedad')}
          footer={(
            <>
              {ficha.telefono && (
                <a className="kit-btn kit-btn-ghost" href={`tel:${ficha.telefono}`}
                  onClick={() => contactar(ficha, 'llamada')}>📞 {ficha.telefono}</a>
              )}
              {waLink(ficha) && (
                <a className="kit-wa" href={waLink(ficha)} target="_blank" rel="noreferrer"
                  onClick={() => contactar(ficha, 'whatsapp')}>💬 WhatsApp</a>
              )}
              {ficha.email && (
                <button className="kit-btn kit-btn-primary" onClick={() => setEmail({
                  lead: ficha,
                  asunto: ficha.expand?.propiedad
                    ? t('email.asuntoPropiedad', { propiedad: ficha.expand.propiedad.titulo })
                    : t('email.asuntoGenerico'),
                  texto: t('email.plantilla', {
                    nombre: ficha.nombre,
                    propiedad: ficha.expand?.propiedad
                      ? t('email.plantillaPropiedad', { propiedad: ficha.expand.propiedad.titulo }) : '',
                  }),
                })}>✉️ {t('email.enviar')}</button>
              )}
            </>
          )}
        >
          {ficha.mensaje && <p className="ficha-mensaje">“{ficha.mensaje}”</p>}

          <h3>{t('lead.prioridadTitulo')}</h3>
          <div className="prioridad" role="group" aria-label={t('lead.prioridadAria', { nombre: ficha.nombre })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={ficha.prioridad === n ? 'activa' : ''}
                aria-pressed={ficha.prioridad === n}
                title={ficha.prioridad === n ? t('lead.quitarPrioridad') : t('lead.prioridadN', { n })}
                onClick={() => cambiarPrioridad(ficha, n)}>{n}</button>
            ))}
            {!ficha.prioridad && <span className="sin" title={t('lead.sinPrioridad')}>—</span>}
          </div>

          <h3>{t('lead.notaTitulo')}</h3>
          <input className="ficha-nota" placeholder={t('lead.nota')} value={nota[ficha.id] ?? ''}
            onChange={(e) => setNota((n) => ({ ...n, [ficha.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && guardarNota(ficha)} />

          <h3>{t('lead.historial')}</h3>
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
        </SidePanel>
      )}
    </>
  );
}
