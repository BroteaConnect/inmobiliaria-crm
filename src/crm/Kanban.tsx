import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { SidePanel } from '../components/kit/SidePanel';
import { EditSheet } from '../components/kit/EditSheet';
import { Dialog, Select, useToast } from '../components/ui';
import { IconArrowLeft, IconArrowRight, IconoEmail, IconoTelefono, IconoWhatsApp } from '../components/kit/Icono';
import { PRIORITY_LEVELS, levelOf, priorityLabelKey, scoreOf } from './priority';
import { VisitaDialog, fechaHoraMadrid } from './VisitaDialog';
import {
  ETAPAS, etiquetaCanal, etiquetaEnvio, type Actividad, type Etapa, type Lead, type Propiedad, type Usuario,
  type Visita, anotar, asignarLead, coincideLead, crearLead, desatendido, enviarEmail, haceCuanto,
  loadActividades, loadLeads, loadPropiedades, loadUsuarios, loadVisitasDeLead, moverLead, onLeadsChange,
  porPrioridad, registrarContacto, setPrioridad, waLink,
} from './api';

export default function Kanban() {
  const { locale, t } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  // False until the first answer: an empty board before the load is not an
  // empty pipeline, and the two need different words.
  const [cargado, setCargado] = useState(false);
  // A failed load is not an empty pipeline either: with the error swallowed the
  // board would tell an agent with forty leads that there are none.
  const [fallo, setFallo] = useState<Error | null>(null);
  const [nota, setNota] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Actividad[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [email, setEmail] = useState<{ lead: Lead; asunto: string; texto: string } | null>(null);
  // The visit form is a dialog like the compositor: the record steps aside
  // and comes back, visits reloaded, when the visit is booked or dropped.
  const [visita, setVisita] = useState<Lead | null>(null);
  // Who a lead can be handed to. Never an error: a closed users rule answers
  // the signed-in agent alone (src/lib/users.ts).
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // Feedback that belongs to no place on the board goes to a toast: it is
  // announced, it leaves by itself, and it never pushes the columns down.
  const toast = useToast();
  // A failure of a modal's own action is also said inside the modal: an open
  // sheet or dialog hides the toasts from assistive technology.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nuevoError, setNuevoError] = useState<string | null>(null);
  const [fichaError, setFichaError] = useState<string | null>(null);
  // Filtros en estado propio (no derivados de los datos): la recarga por SSE
  // reemplaza `leads` sin tocar lo que la agente tiene seleccionado/escrito.
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [filtroProp, setFiltroProp] = useState(''); // '' = todas, 'sin' = sin propiedad, o id
  const [busqueda, setBusqueda] = useState('');
  // Which column a phone is looking at. On a laptop every column is visible and
  // this changes nothing — the switch is a CSS media query, so the desktop
  // board is untouched by it.
  const [etapaMovil, setEtapaMovil] = useState<Etapa>(ETAPAS[0]);

  const recargar = () => loadLeads()
    .then((r) => { setLeads(r); setFallo(null); })
    .catch((e: unknown) => setFallo(e instanceof Error ? e : new Error(String(e))))
    .finally(() => setCargado(true));
  useEffect(() => { recargar(); return onLeadsChange(recargar); }, []);
  useEffect(() => { loadPropiedades().then(setPropiedades).catch(() => {}); }, []);
  useEffect(() => { loadUsuarios().then(setUsuarios); }, []);

  // El filtrado es 100% en cliente sobre la ventana que ya trae loadLeads.
  const visibles = leads.filter((l) =>
    (filtroProp === '' || (filtroProp === 'sin' ? !l.propiedad : l.propiedad === filtroProp)) &&
    coincideLead(l, busqueda));

  /** `null` limpia la prioridad; el botón activo la manda al pulsarlo otra vez. */
  const cambiarPrioridad = async (l: Lead, score: number | null) => {
    await setPrioridad(l.id, score);
    recargar();
  };

  // Ref del lead abierto: descarta respuestas de cargas que llegan tarde,
  // para que el panel nunca muestre el historial de otro lead.
  const abiertoRef = useRef<string | null>(null);
  const abrir = (id: string | null) => { abiertoRef.current = id; setAbierto(id); setFichaError(null); };
  const cargarHistorial = async (id: string) => {
    const [acts, vis] = await Promise.all([
      loadActividades(id).catch(() => []),
      loadVisitasDeLead(id).catch((): Visita[] => []),
    ]);
    if (abiertoRef.current === id) { setHistorial(acts); setVisitas(vis); }
  };

  /** Hand the open lead to an agent; '' is nobody. Said in the panel if it fails. */
  const asignar = async (l: Lead, userId: string) => {
    if ((l.asignado ?? '') === userId) return;
    try {
      await asignarLead(l.id, userId || null);
      recargar();
    } catch (e) {
      const msg = t('lead.asignadoError', { nombre: l.nombre, error: (e as Error).message });
      setFichaError(msg);
      toast({ title: msg, tone: 'error' });
    }
  };
  const opcionesAgente = (l: Lead) => {
    const out = [
      { value: '', label: t('lead.asignadoNadie') },
      ...usuarios.map((u) => ({ value: u.id, label: u.name || u.email || u.id })),
    ];
    // Assigned to somebody the directory does not list (the rule still closed
    // on this instance): the value is kept and named, never silently dropped.
    if (l.asignado && !usuarios.some((u) => u.id === l.asignado)) out.push({ value: l.asignado, label: t('lead.asignadoOtro') });
    return out;
  };

  /** Open the record. The history is loaded before the panel appears, so it
   *  never shows the previous lead's contacts for a frame. */
  const ficha = abierto ? (leads.find((l) => l.id === abierto) ?? null) : null;
  // Alta manual. Una agencia en marcha recibe leads por teléfono y por la calle,
  // y hasta ahora solo podían entrar por el formulario de la web o por un CSV:
  // el caso más común no tenía puerta.
  const [nuevo, setNuevo] = useState<{ nombre: string; telefono: string; email: string;
    propiedad: string; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const abrirFicha = async (l: Lead) => {
    abrir(l.id);
    setHistorial([]);
    setVisitas([]);
    await cargarHistorial(l.id);
  };

  // Like the compositor: the record closes while the visit is booked and
  // reopens, visits reloaded, so the agent lands on the proof of it.
  const programarVisita = (l: Lead) => { abrir(null); setVisita(l); };
  const cerrarVisita = async () => {
    if (!visita) return;
    const l = visita;
    setVisita(null);
    await abrirFicha(l);
  };

  const verHistorial = async (l: Lead) => {
    if (abierto === l.id) { abrir(null); return; }
    setHistorial([]);
    setVisitas([]);
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
      const msg = t('lead.notaError', { nombre: l.nombre });
      setFichaError(msg);
      toast({ title: msg, tone: 'error' });
      return;
    }
    setFichaError(null);
    setNota((n) => ({ ...n, [l.id]: '' }));
    // Cargamos antes de abrir para no enseñar el historial de otro lead.
    const acts = await loadActividades(l.id).catch(() => []);
    abrir(l.id);
    setHistorial(acts);
  };

  // The compositor is a dialog: "answer this before continuing". One surface
  // at a time: the record steps aside while the email is written and comes
  // back — with the email in its history — when it is sent or dropped, so
  // the agent lands on the proof of what just happened.
  const redactar = (l: Lead) => {
    abrir(null);
    setEmail({
      lead: l,
      asunto: l.expand?.propiedad
        ? t('email.asuntoPropiedad', { propiedad: l.expand.propiedad.titulo })
        : t('email.asuntoGenerico'),
      texto: t('email.plantilla', {
        nombre: l.nombre,
        propiedad: l.expand?.propiedad
          ? t('email.plantillaPropiedad', { propiedad: l.expand.propiedad.titulo }) : '',
      }),
    });
  };
  const cerrarEmail = async () => {
    if (!email) return;
    const { lead } = email;
    setEmail(null);
    await abrirFicha(lead);
  };
  const [enviando, setEnviando] = useState(false);
  const mandarEmail = async () => {
    if (!email) return;
    setEnviando(true);
    setEmailError(null);
    try {
      await enviarEmail(email.lead, email.asunto, email.texto);
      toast({ title: t('email.enviado', { nombre: email.lead.nombre }), tone: 'ok' });
      recargar();
      await cerrarEmail();
    } catch (err) {
      const msg = t('email.error', { error: (err as Error).message });
      setEmailError(msg);
      toast({ title: msg, tone: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  const opcionesPropiedad = propiedades.map((p) => ({ value: p.id, label: p.titulo }));

  return (
    <>
      {visita && <VisitaDialog lead={visita} onClose={cerrarVisita} onCreated={cerrarVisita} />}

      {email && (
        <Dialog
          open
          onOpenChange={(open) => { if (!open && !enviando) cerrarEmail(); }}
          title={t('email.titulo', { nombre: email.lead.nombre })}
          description={email.lead.email}
          error={emailError}
          footer={(
            <>
              <button className="kit-btn kit-btn-ghost" onClick={cerrarEmail} disabled={enviando}>{t('email.cancelar')}</button>
              <button className="kit-btn kit-btn-primary" onClick={mandarEmail} disabled={enviando || !email.asunto || !email.texto}>
                {enviando ? t('email.enviando') : t('email.enviar')}
              </button>
            </>
          )}
        >
          <label className="campo">{t('email.asunto')}
            <input value={email.asunto} autoFocus onChange={(e) => setEmail({ ...email, asunto: e.target.value })} />
          </label>
          <label className="campo">{t('email.mensaje')}
            <textarea rows={8} value={email.texto} onChange={(e) => setEmail({ ...email, texto: e.target.value })} />
          </label>
        </Dialog>
      )}

      <div className="filtros">
        <button className="kit-btn kit-btn-primary" onClick={() => setNuevo({
          nombre: '', telefono: '', email: '', propiedad: filtroProp === 'sin' ? '' : filtroProp, mensaje: '',
        })}>+ {t('lead.nuevo')}</button>
        <Select
          value={filtroProp}
          onValueChange={setFiltroProp}
          ariaLabel={t('filtros.propiedad')}
          className="filtro-propiedad"
          options={[
            { value: '', label: t('filtros.todas') },
            { value: 'sin', label: t('filtros.sinPropiedad') },
            ...opcionesPropiedad,
          ]}
        />
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

      {/* Loading keeps the board's shape underneath; the error says what went
          wrong; the two empties say what comes next: create the first lead, or
          clear the filter. An error never reads as an empty pipeline. */}
      {!cargado && <p className="tablero-estado" role="status">{t('list.loading')}</p>}
      {cargado && fallo && <p className="aviso aviso-error" role="alert">{t('list.error', { error: fallo.message })}</p>}
      {cargado && !fallo && leads.length === 0 && <p className="tablero-estado" role="status">{t('lead.vacio')}</p>}
      {cargado && leads.length > 0 && visibles.length === 0 && (
        <p className="tablero-estado" role="status">{t('lead.sinResultados')}</p>
      )}

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
                    {desatendido(l) && <span className="lead-alerta" role="img" aria-label={t('lead.desatendido')} />}
                    {l.expand?.propiedad ? `${l.expand.propiedad.titulo} · ` : ''}
                    {haceCuanto(locale, l.ultimo_contacto)}
                  </span>
                </button>

                <div className="mover">
                  <button onClick={() => mover(l, -1)} disabled={l.etapa === ETAPAS[0]} aria-label={t('lead.etapaAnterior')}><IconArrowLeft /></button>
                  <button onClick={() => mover(l, 1)} disabled={l.etapa === ETAPAS[ETAPAS.length - 1]} aria-label={t('lead.etapaSiguiente')}><IconArrowRight /></button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>

      {nuevo && (
        <EditSheet
          open
          // EditSheet refuses to close while it is saving: a panel that vanishes
          // mid-save invites a second entry, and the first one pops open on its
          // own later. Enter in any field saves, as in every form of the CRM.
          onClose={() => setNuevo(null)}
          title={t('lead.nuevoTitulo')}
          subtitle={t('lead.nuevoAyuda')}
          error={nuevoError}
          busy={guardando}
          saveLabel={t('lead.crear')}
          busyLabel={t('lead.guardando')}
          cancelLabel={t('email.cancelar')}
          onSubmit={async () => {
            // A lead needs a name, and a way to be reached. The second rule is
            // one `required` cannot express, so it is said here rather than
            // left to a button that greys out for reasons of its own.
            if (!nuevo.nombre.trim()) { setNuevoError(t('lead.faltaNombre')); return; }
            if (!nuevo.telefono.trim() && !nuevo.email.trim()) { setNuevoError(t('lead.faltaContacto')); return; }
            setGuardando(true);
            setNuevoError(null);
            try {
              // `origen: 'manual'` distingue lo que entra por teléfono de lo
              // que entra por la web: sin eso, el informe de procedencia
              // cuenta como web algo que nunca pasó por ella.
              const creado = await crearLead({
                nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim(),
                email: nuevo.email.trim(), mensaje: nuevo.mensaje.trim(),
                propiedad: nuevo.propiedad || undefined, etapa: 'nuevo', origen: 'manual',
              });
              setNuevo(null);
              recargar();
              // Se abre la ficha recién creada: quien acaba de colgar el
              // teléfono suele querer anotar algo más. Con su historial
              // (vacío) y no con el del último lead abierto.
              if (creado?.id) {
                setHistorial([]);
                abrir(creado.id);
                cargarHistorial(creado.id);
              }
            } catch (e) {
              const msg = t('lead.nuevoError', { error: (e as Error).message });
              setNuevoError(msg);
              toast({ title: msg, tone: 'error' });
            } finally {
              setGuardando(false);
            }
          }}
        >
          <label className="campo">{t('lead.campo.nombre')}
            <input value={nuevo.nombre} autoFocus required
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </label>
          <label className="campo">{t('lead.campo.telefono')}
            <input value={nuevo.telefono} inputMode="tel"
              onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
          </label>
          <label className="campo">{t('lead.campo.email')}
            <input value={nuevo.email} type="email"
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          </label>
          <div className="campo">
            <span>{t('filtros.propiedad')}</span>
            <Select
              value={nuevo.propiedad}
              onValueChange={(v) => setNuevo({ ...nuevo, propiedad: v })}
              ariaLabel={t('filtros.propiedad')}
              options={[{ value: '', label: t('filtros.sinPropiedad') }, ...opcionesPropiedad]}
            />
          </div>
          <label className="campo">{t('lead.campo.mensaje')}
            <textarea rows={3} value={nuevo.mensaje}
              onChange={(e) => setNuevo({ ...nuevo, mensaje: e.target.value })} />
          </label>
        </EditSheet>
      )}

      {/* The record, beside the board rather than instead of it. */}
      {ficha && (
        <SidePanel
          open
          onClose={() => abrir(null)}
          title={ficha.nombre}
          subtitle={ficha.expand?.propiedad?.titulo ?? t('filtros.sinPropiedad')}
          error={fichaError}
          footer={(
            <>
              {ficha.telefono && (
                <a className="kit-btn kit-btn-ghost" href={`tel:${ficha.telefono}`}
                  onClick={() => contactar(ficha, 'llamada')}><IconoTelefono /> {ficha.telefono}</a>
              )}
              {waLink(ficha) && (
                <a className="kit-wa" href={waLink(ficha)} target="_blank" rel="noreferrer"
                  onClick={() => contactar(ficha, 'whatsapp')}><IconoWhatsApp /> WhatsApp</a>
              )}
              {ficha.email && (
                <button className="kit-btn kit-btn-primary" onClick={() => redactar(ficha)}>
                  <IconoEmail /> {t('email.enviar')}
                </button>
              )}
            </>
          )}
        >
          {ficha.mensaje && <p className="ficha-mensaje">“{ficha.mensaje}”</p>}
          {/* Lo que pidió al otro lado: la web ya pregunta cuándo le va bien, y
              esa respuesta solo sirve si la ve quien va a llamar. */}
          {ficha.franja && (
            <p className="ficha-franja">
              <span>{t('lead.franja')}</span> {t(`lead.franja.${ficha.franja}`)}
            </p>
          )}

          <h3>{t('lead.prioridadTitulo')}</h3>
          {/* Three states, not five numbers. The design deletes the score
              because the colour already carries it, and a 1–5 ramp asks the
              agent to invent a difference between a 2 and a 3 that nobody can
              defend. `leads.prioridad` stays a number underneath (5/3/1), so no
              data moved and the finer score can come back if it is ever wanted. */}
          <div className="prioridad" role="group" aria-label={t('lead.prioridadAria', { nombre: ficha.nombre })}>
            {PRIORITY_LEVELS.map((level) => {
              const activa = levelOf(ficha.prioridad) === level;
              return (
                <button key={level} className={`nivel nivel-${level}${activa ? ' activa' : ''}`}
                  aria-pressed={activa}
                  onClick={() => cambiarPrioridad(ficha, activa ? null : scoreOf(level))}>
                  {t(priorityLabelKey(level))}
                </button>
              );
            })}
            {levelOf(ficha.prioridad) === 'none' && <span className="sin">{t('lead.sinPrioridad')}</span>}
          </div>

          <h3>{t('lead.asignadoTitulo')}</h3>
          {/* Whose lead this is. A single value, edited where it is read, like
              the priority above it; the web assigns the agent on duty
              (Ajustes) and this is where that decision is overridden. */}
          <Select
            className="ficha-asignado"
            value={ficha.asignado ?? ''}
            onValueChange={(v) => asignar(ficha, v)}
            ariaLabel={t('lead.asignadoAria', { nombre: ficha.nombre })}
            options={opcionesAgente(ficha)}
          />

          <h3>{t('lead.notaTitulo')}</h3>
          <input className="ficha-nota" placeholder={t('lead.nota')} value={nota[ficha.id] ?? ''}
            onChange={(e) => setNota((n) => ({ ...n, [ficha.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && guardarNota(ficha)} />

          <h3>{t('lead.visitas')}</h3>
          <ul className="ficha-visitas">
            {visitas.length === 0 && <li className="vacio">{t('lead.sinVisitas')}</li>}
            {visitas.map((v) => {
              const resultado = v.resultado ?? 'pendiente';
              return (
                <li key={v.id}>
                  <time dateTime={v.cuando.replace(' ', 'T')}>{fechaHoraMadrid(locale, v.cuando)}</time>
                  <span className="lugar">{v.expand?.propiedad?.titulo ?? t('filtros.sinPropiedad')}</span>
                  <span className={`visita-estado visita-estado-${resultado}`}>{t(`visitas.resultado.${resultado}`)}</span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="kit-btn kit-btn-ghost" onClick={() => programarVisita(ficha)}>
            {t('lead.programarVisita')}
          </button>

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
