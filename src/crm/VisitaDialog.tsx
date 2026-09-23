import { useEffect, useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { Dialog, Select, useToast } from '../components/ui';
import { currentUser } from '../lib/auth';
import { MADRID_TZ, instantOfMadridWall, nextMadridSlot } from '../lib/madrid-day';
import { intlOf } from '../lib/i18n';
import {
  type Lead, type Propiedad, type Usuario, type Visita,
  coincideLead, crearVisita, loadLeads, loadPropiedades, loadUsuarios,
} from './api';

// Scheduling a visit: who, where, with whom, when.
//
// A dialog and not the kit's EditSheet, on purpose. The two places this opens
// from are the day's queue and the lead's record, and the record IS a sheet:
// a second sheet sliding over the first would leave the agent with two panels
// and no board. The compositor set the precedent (Kanban.tsx): the record
// steps aside, the question is answered in the middle of the screen, and the
// record comes back with the answer in it.
//
// The clock is Madrid's. A `datetime-local` field has no zone, and a browser
// in Dubai would read "10:30" as Gulf time and book the visit two hours off;
// the value is read as Europe/Madrid wall time through src/lib/madrid-day.ts,
// and the field's hint says so. Never the browser's zone, silently.

/** The lead this visit is for, when the caller already knows it. */
export function VisitaDialog({ lead, leads, onClose, onCreated }: {
  lead?: Lead;
  /** The leads to search when none is preselected; loaded here when absent. */
  leads?: Lead[];
  onClose: () => void;
  onCreated: (visita: Visita) => void;
}) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const [elegido, setElegido] = useState<Lead | null>(lead ?? null);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState<Lead[]>(leads ?? []);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [propiedad, setPropiedad] = useState(lead?.propiedad ?? '');
  const [agente, setAgente] = useState(currentUser()?.id ?? '');
  const [cuando, setCuando] = useState(() => nextMadridSlot());
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let alive = true;
    // Only what can be visited: a draft has no photos and no public page, and
    // a sold flat is not shown to anybody.
    loadPropiedades().then((ps) => { if (alive) setPropiedades(ps.filter((p) => p.estado === 'publicada')); }).catch(() => {});
    // Never throws: a closed users rule answers the signed-in agent alone.
    loadUsuarios().then((us) => { if (alive) setUsuarios(us); });
    if (!lead && !leads) loadLeads().then((ls) => { if (alive) setCandidatos(ls); }).catch(() => {});
    return () => { alive = false; };
  }, [lead, leads]);

  const opcionesPropiedad = [
    { value: '', label: t('filtros.sinPropiedad') },
    ...propiedades.map((p) => ({ value: p.id, label: p.titulo })),
  ];
  // The lead's own property may be a draft; it is still the flat they asked
  // about, so it stays selectable rather than silently dropping to "none".
  if (propiedad && !propiedades.some((p) => p.id === propiedad) && elegido?.expand?.propiedad?.id === propiedad) {
    opcionesPropiedad.push({ value: propiedad, label: elegido.expand.propiedad.titulo });
  }
  const opcionesAgente = [
    { value: '', label: t('visitas.sinAgente') },
    ...usuarios.map((u) => ({ value: u.id, label: u.name || u.email || u.id })),
  ];
  // A break-glass session has no user; the default then is nobody, said out loud.
  const agenteValido = agente && usuarios.some((u) => u.id === agente) ? agente : '';
  // Each Select is remounted when its option list changes. Inside a <form>
  // Radix mirrors the value into a hidden native <select>, and a value that
  // changes in the same render as the options arrive finds no <option> yet:
  // the native control collapses to '' and Radix reports that back, which is
  // how the default agent went missing. A fresh mount with value and options
  // together never fires that report.
  const claveDe = (opciones: { value: string }[]) => opciones.map((o) => o.value).join('|');

  const resultados = !elegido && q.trim()
    ? candidatos.filter((l) => coincideLead(l, q)).slice(0, 8)
    : [];

  const elegir = (l: Lead) => {
    setElegido(l);
    setQ('');
    if (!propiedad && l.propiedad) setPropiedad(l.propiedad);
  };

  const programar = async () => {
    if (guardando) return;
    // The two rules `required` cannot express: a chosen lead (the search box
    // is not the value) and a wall clock that exists.
    if (!elegido) { setError(t('visitas.faltaLead')); return; }
    const instante = instantOfMadridWall(cuando);
    if (!instante) { setError(t('visitas.faltaCuando')); return; }
    setGuardando(true);
    setError(null);
    try {
      const creada = await crearVisita({
        lead: elegido.id,
        propiedad: propiedad || undefined,
        agente: agenteValido || undefined,
        cuando: instante.toISOString(),
        notas: notas.trim() || undefined,
      });
      toast({
        tone: 'ok',
        title: t('visitas.creada', {
          nombre: elegido.nombre,
          cuando: new Intl.DateTimeFormat(intlOf(locale), {
            timeZone: MADRID_TZ, hourCycle: 'h23', dateStyle: 'medium', timeStyle: 'short',
          }).format(instante),
        }),
      });
      onCreated(creada);
    } catch (e) {
      // Said inside the dialog too: an open modal hides the toast from
      // assistive technology, and the failure belongs where the focus is.
      const msg = t('visitas.crearError', { error: (e as Error).message });
      setError(msg);
      toast({ title: msg, tone: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !guardando) onClose(); }}
      title={t('visitas.dialogo.titulo')}
      description={lead ? lead.nombre : t('visitas.dialogo.ayuda')}
      error={error}
      footer={(
        <>
          <button type="button" className="kit-btn kit-btn-ghost" onClick={onClose} disabled={guardando}>
            {t('email.cancelar')}
          </button>
          {/* Never disabled for an incomplete form, only while saving: a dead
              button explains nothing. The form says what is missing when asked. */}
          <button type="submit" form="visita-form" className="kit-btn kit-btn-primary" disabled={guardando}>
            {guardando ? t('visitas.programando') : t('visitas.programar')}
          </button>
        </>
      )}
    >
      <form id="visita-form" onSubmit={(e) => { e.preventDefault(); programar(); }}>
        {!lead && (
          <div className="campo lead-busqueda">
            {elegido
              ? <span>{t('visitas.campo.lead')}</span>
              : <label htmlFor="visita-lead">{t('visitas.campo.lead')}</label>}
            {elegido ? (
              <div className="lead-elegido">
                <span>{elegido.nombre}</span>
                <button type="button" className="kit-btn kit-btn-ghost" onClick={() => setElegido(null)}>
                  {t('visitas.campo.leadCambiar')}
                </button>
              </div>
            ) : (
              <>
                <input
                  id="visita-lead" type="search" value={q} autoFocus autoComplete="off"
                  placeholder={t('visitas.campo.leadBuscar')}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q.trim() && (
                  <ul className="lead-resultados" aria-label={t('visitas.campo.lead')}>
                    {resultados.length === 0 && <li className="vacio">{t('visitas.campo.leadSinResultados')}</li>}
                    {resultados.map((l) => (
                      <li key={l.id}>
                        <button type="button" onClick={() => elegir(l)}>
                          <span>{l.nombre}</span>
                          <small>{[l.telefono, l.email].filter(Boolean).join(' · ')}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <div className="campo">
          <span>{t('visitas.campo.propiedad')}</span>
          <Select
            key={claveDe(opcionesPropiedad)}
            value={propiedad}
            onValueChange={setPropiedad}
            ariaLabel={t('visitas.campo.propiedad')}
            options={opcionesPropiedad}
          />
        </div>

        <div className="campo">
          <span>{t('visitas.campo.agente')}</span>
          <Select
            key={claveDe(opcionesAgente)}
            value={agenteValido}
            onValueChange={setAgente}
            ariaLabel={t('visitas.campo.agente')}
            options={opcionesAgente}
          />
        </div>

        <label className="campo">{t('visitas.campo.cuando')}
          <input
            type="datetime-local" value={cuando} required step={900} autoFocus={!!lead}
            onChange={(e) => setCuando(e.target.value)}
          />
          <span className="campo-ayuda">{t('visitas.campo.cuandoAyuda')}</span>
        </label>

        <label className="campo">{t('visitas.campo.notas')}
          <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
      </form>
    </Dialog>
  );
}

/** "10:30", on the Madrid clock, for a PocketBase datetime. */
export const horaMadrid = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(intlOf(locale), { timeZone: MADRID_TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso.replace(' ', 'T')));

/** "23 sept, 10:30", on the Madrid clock, for a PocketBase datetime. */
export const fechaHoraMadrid = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(intlOf(locale), {
    timeZone: MADRID_TZ, hourCycle: 'h23', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso.replace(' ', 'T')));
