import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../lib/LocaleContext';
import { Alert, Kpi, ListCard, WhatsAppButton } from '../../components/kit';
import { Select, useToast } from '../../components/ui';
import { VisitaDialog, horaMadrid } from '../../crm/VisitaDialog';
import {
  VISITA_RESULTADOS, actualizarVisita, loadLeads, loadActividadesRecientes, loadVisitasDeHoy,
  onLeadsChange, onVisitasChange, type Actividad, type Lead, type Visita, type VisitaResultado,
} from '../../crm/api';
import { buildQueue, summarize, type QueueItem } from './queue';
import './today.css';

// The day's screen: what is waiting for an answer, in the order it should be
// answered, and nothing else.
//
// Every row is the kit's list card — signal, name, one line of context, one
// action — because the design's whole argument is that leads, replies, rules
// and agenda entries are the same shape and only look different when somebody
// designs them twice.
//
// The agenda arrived with its data (E4): today's visits, on the Madrid
// calendar day, sit above the queue with their outcome as the one control of
// the row. What the design draws and this still does NOT show: the campaign
// counters ("312 / 986") and the "booking without a contract" bucket. There is
// no data behind either — no campaign rows, no contract field — and a
// dashboard that prints a number it cannot know is worse than a dashboard
// with fewer numbers. They arrive when their data does.

/** Where each bucket's single action takes you. */
const ACTION_KEY: Record<QueueItem['bucket'], string> = {
  newUnanswered: 'today.action.reply',
  draftReady: 'today.action.review',
  stale: 'today.action.revive',
};

export default function Today() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Waved away for this session only, in memory: "not today" is a decision
  // about the next ten minutes, and persisting it would hide a lead tomorrow.
  const [dismissed, setDismissed] = useState<string[]>([]);

  const reload = () => {
    setError('');
    Promise.all([loadLeads(), loadActividadesRecientes()])
      .then(([l, a]) => { setLeads(l); setActivities(a); })
      .catch((e: Error) => setError(t('today.error', { error: e.message })))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);
  // The board is realtime elsewhere; a queue that goes stale while you look at
  // it is a queue you stop trusting.
  useEffect(() => onLeadsChange(reload), []);

  // Today's visits, loaded apart from the queue: a failing visits collection
  // must not take the queue down, and the other way round.
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [visitasCargando, setVisitasCargando] = useState(true);
  const [visitasError, setVisitasError] = useState('');
  const [dialogo, setDialogo] = useState(false);
  const recargarVisitas = () => {
    setVisitasError('');
    loadVisitasDeHoy()
      .then(setVisitas)
      .catch((e: Error) => setVisitasError(t('visitas.error', { error: e.message })))
      .finally(() => setVisitasCargando(false));
  };
  useEffect(recargarVisitas, []);
  useEffect(() => onVisitasChange(recargarVisitas), []);

  // The outcome is set on the row, where the visit is read. One write at a
  // time per visit: a second press on a slow link must not race the first.
  const [escribiendo, setEscribiendo] = useState<string | null>(null);
  const cambiarResultado = async (v: Visita, resultado: VisitaResultado) => {
    if (v.resultado === resultado || escribiendo) return;
    setEscribiendo(v.id);
    const nombre = v.expand?.lead?.nombre ?? '';
    try {
      await actualizarVisita(v.id, { resultado });
      // Painted at once; the realtime event confirms it a moment later.
      setVisitas((vs) => vs.map((x) => (x.id === v.id ? { ...x, resultado } : x)));
      toast({ tone: 'ok', title: t('visitas.resultadoCambiado', { nombre, resultado: t(`visitas.resultado.${resultado}`) }) });
    } catch (e) {
      toast({ tone: 'error', title: t('visitas.resultadoError', { error: (e as Error).message }) });
    } finally {
      setEscribiendo(null);
    }
  };
  const opcionesResultado = VISITA_RESULTADOS.map((r) => ({ value: r, label: t(`visitas.resultado.${r}`) }));

  const now = Date.now();
  const queue = useMemo(
    () => buildQueue({ leads, activities, dismissed, now }),
    [leads, activities, dismissed, now],
  );
  const summary = useMemo(() => summarize(leads, queue, now), [leads, queue, now]);

  const days = (iso: string) => Math.floor((now - new Date(iso.replace(' ', 'T')).getTime()) / 86400000);
  const minutes = (iso: string) => Math.floor((now - new Date(iso.replace(' ', 'T')).getTime()) / 60000);

  /** The one line under the name: why this lead is here, and about what. */
  const contextOf = (item: QueueItem) => {
    const prop = item.lead.expand?.propiedad?.titulo;
    const detail = prop ? ` · ${prop}` : '';
    if (item.bucket === 'newUnanswered') return t('today.context.new') + detail;
    if (item.bucket === 'draftReady') return (item.trigger?.nota?.trim() || t('today.context.draft')) + detail;
    return t('today.context.stale', { dias: String(days(item.since)) }) + detail;
  };

  return (
    <section className="today">
      <header className="today-head">
        <h1>{t('today.titulo')}</h1>
        <div className="today-kpis">
          <Kpi label={t('today.kpi.pending')} value={summary.pending} />
          <Kpi label={t('today.kpi.unattended')} value={summary.unattended} />
          <Kpi label={t('today.kpi.new')} value={summary.newThisWeek} of={summary.total} />
        </div>
      </header>

      {dialogo && (
        <VisitaDialog
          leads={leads}
          onClose={() => setDialogo(false)}
          onCreated={() => { setDialogo(false); recargarVisitas(); }}
        />
      )}

      {/* The agenda: one card per visit, the time and the outcome as its
          signal, the outcome control as its one action. Loading keeps the
          section's shape; an error never reads as a free day. */}
      <section className="today-visitas" aria-labelledby="today-visitas-titulo">
        <div className="today-visitas-head">
          <h2 id="today-visitas-titulo">
            {t('visitas.hoy')} {!visitasCargando && !visitasError && <span className="n">{visitas.length}</span>}
          </h2>
          <button type="button" className="kit-btn kit-btn-primary" onClick={() => setDialogo(true)}>
            + {t('visitas.nueva')}
          </button>
        </div>
        {visitasError && <p className="aviso aviso-error" role="alert">{visitasError}</p>}
        {visitasCargando && !visitasError && <p className="today-status" role="status">{t('visitas.cargando')}</p>}
        {!visitasCargando && !visitasError && visitas.length === 0 && (
          <p className="today-status" role="status">{t('visitas.vacio')}</p>
        )}
        {visitas.map((v) => {
          const nombre = v.expand?.lead?.nombre ?? '';
          const resultado = v.resultado ?? 'pendiente';
          return (
            <ListCard
              key={v.id}
              signal={(
                <>
                  <time className="visita-hora" dateTime={v.cuando.replace(' ', 'T')}>{horaMadrid(locale, v.cuando)}</time>
                  <span className={`visita-estado visita-estado-${resultado}`}>{t(`visitas.resultado.${resultado}`)}</span>
                </>
              )}
              name={nombre}
              context={[
                v.expand?.propiedad?.titulo ?? t('filtros.sinPropiedad'),
                v.expand?.agente?.name || v.expand?.agente?.email || t('visitas.sinAgente'),
              ].join(' · ')}
              action={(
                <Select
                  className="visita-resultado"
                  value={resultado}
                  onValueChange={(r) => cambiarResultado(v, r as VisitaResultado)}
                  ariaLabel={t('visitas.resultadoAria', { nombre })}
                  disabled={escribiendo === v.id}
                  options={opcionesResultado}
                />
              )}
            />
          );
        })}
      </section>

      <h2 className="today-cola">{t('today.cola')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="today-status">{t('today.cargando')}</p>}

      {!loading && !queue.length && !error && (
        <p className="today-status today-clear">{t('today.vacio')}</p>
      )}

      {queue.map((item) => {
        // The alert is the only red, and it replaces the rest of the signal
        // rather than joining it: a new lead unanswered for under an hour is
        // the one thing that cannot wait.
        const fresh = item.bucket === 'newUnanswered' && minutes(item.since) < 60;
        return (
          <ListCard
            key={item.lead.id}
            // Un punto de color cuando no hay alerta, y la alerta cuando la hay:
            // nunca los dos, que es lo que el diseño prohíbe explícitamente.
            signal={fresh
              ? <Alert>{t('today.signal.minutes', { min: String(minutes(item.since)) })}</Alert>
              : undefined}
            punto={fresh ? undefined : (item.bucket === 'draftReady' ? 'alta' : 'media')}
            aplazar={() => setDismissed((d) => [...d, item.lead.id])}
            aplazarLabel={t('today.action.later')}
            name={item.lead.nombre}
            context={contextOf(item)}
            extra={item.lead.telefono
              ? (
                <WhatsAppButton
                  phone={item.lead.telefono}
                  label={t('today.whatsapp')}
                  message={t('today.whatsapp.mensaje', { nombre: item.lead.nombre })}
                />
              )
              : undefined}
            action={(
              <a
                className={`kit-btn kit-btn-${fresh ? 'primary' : 'ghost'}`}
                href={`/?lead=${item.lead.id}`}
              >
                {t(ACTION_KEY[item.bucket])}
              </a>
            )}
          />
        );
      })}

      {dismissed.length > 0 && (
        <p className="today-status">
          {t('today.aplazados', { n: String(dismissed.length) })}{' '}
          <button type="button" className="today-undo" onClick={() => setDismissed([])}>
            {t('today.deshacer')}
          </button>
        </p>
      )}
      <p className="today-foot" lang={locale}>{t('today.pie')}</p>
    </section>
  );
}
