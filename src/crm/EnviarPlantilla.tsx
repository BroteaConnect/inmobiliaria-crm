import { useMemo, useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { useSettings } from '../lib/SettingsContext';
import { monedaDe } from '../lib/settings';
import { currentUser, signOutAndAnnounce } from '../lib/auth';
import { Dialog, Select, useToast } from '../components/ui';
import {
  type Actividad, type CanalMensaje, type Idioma, type Lead, type Plantilla, enviarPlantilla, esSesionCaducada,
} from './api';
import { faltantes, fieldsOf, render, reparoDe, variablesDeLead, ventanaAbierta, viaPrevista } from './plantilla-form';
import './plantillas.css';

// "Enviar plantilla" on the lead card: which channel, which template, with
// which values — and, before anything leaves, the exact text the lead will
// read, in the lead's own language.
//
// A dialog and not a sheet, for the reason the visit form gives: it opens from
// the lead's record, and the record IS a sheet. The record steps aside, the
// question is answered in the middle, and the record comes back with the send
// in its history.
//
// The language is NOT a choice here. The chassis renders the half that matches
// `leads.idioma` and nothing the CRM posts can change that, so a picker would
// be a control that does not control anything: the language is shown as the
// fact it is, next to the preview it explains.
//
// Nothing about deliverability is decided here either — that is the chassis's
// call — but everything it will decide is already known, so the dialog says it
// first: a retired template is refused before the round trip, a WhatsApp
// template Twilio has not approved can only go out while the lead's 24-hour
// window is open, and a draft going to a client is worth a word.
//
// The preview promises only what it can keep. Outside the 24-hour window a
// WhatsApp template leaves as the Content Meta approved, and that text lives
// at Meta, not in the row: the CRM cannot show it and must not pretend the
// row's current body is it. So for that one route the preview stops being
// titled "what they will receive" and says what actually happens, values
// included. What keeps the two texts from diverging in the first place is the
// editor, which freezes an approved row (plantilla-form.ts `contentAprobado`).

export function EnviarPlantilla({ lead, actividades, plantillas, onClose, onSent }: {
  lead: Lead;
  /** The lead's own activities, to read Meta's 24-hour window off. */
  actividades: Actividad[];
  /** Every template, any channel; the dialog shows the chosen channel's. */
  plantillas: Plantilla[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { locale, t } = useI18n();
  const { settings } = useSettings();
  const toast = useToast();
  // Only what the lead can be reached by. The preferred channel wins when it
  // is one of them; otherwise the only one there is.
  const canales = ([lead.telefono && 'whatsapp', lead.email && 'email'] as const).filter(Boolean) as CanalMensaje[];
  const [canal, setCanal] = useState<CanalMensaje>(() =>
    (lead.canal_preferido && canales.includes(lead.canal_preferido) ? lead.canal_preferido : canales[0] ?? 'whatsapp'));
  const [plantillaId, setPlantillaId] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [caducada, setCaducada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const idioma: Idioma = lead.idioma === 'en' ? 'en' : 'es';
  const ventana = useMemo(() => ventanaAbierta(actividades), [actividades]);
  /** `content` is the route whose text the CRM does not hold (see the note above). */
  const via = viaPrevista(canal, ventana);
  const disponibles = plantillas.filter((p) => p.canal === canal);
  const plantilla = disponibles.find((p) => p.id === plantillaId) ?? null;
  const reparo = plantilla ? reparoDe(plantilla, idioma, ventana) : null;

  const yo = currentUser();
  const base = variablesDeLead(lead, yo?.name || yo?.email || '', monedaDe(settings), locale);
  const variables = plantilla ? fieldsOf(plantilla).variables : [];
  // The agent's edits over what the record knows; a box the agent cleared
  // stays cleared (`??`, not `||`), and is then reported as missing.
  const valores: Record<string, string> = Object.fromEntries(variables.map((v) => [v, edits[v] ?? base[v] ?? '']));

  const etiquetaEstado = (estado?: string) => t(`plantillas.estado.${estado || 'borrador'}`);
  /** The one sentence about this template's sendability, or null. */
  const textoReparo = () => {
    if (!reparo) return null;
    if (reparo.code === 'retirada') return t('plantillas.enviar.bloqueo.retirada');
    if (reparo.code === 'twilio') return t('plantillas.enviar.bloqueo.twilio', { estado: t(`plantillas.content.${reparo.estado}`) });
    if (reparo.code === 'ventana') return t('plantillas.enviar.aviso.ventana', { estado: t(`plantillas.content.${reparo.estado}`) });
    return t('plantillas.enviar.aviso.borrador', { estado: etiquetaEstado(reparo.estado) });
  };

  const opcionesCanal = canales.map((c) => ({ value: c, label: t(`plantillas.canal.${c}`) }));
  // The state travels in the label, so a template that cannot leave says so in
  // the list rather than only after it is picked.
  const opcionesPlantilla = [
    { value: '', label: t('plantillas.enviar.elige') },
    ...disponibles.map((p) => {
      const r = reparoDe(p, idioma, ventana);
      return {
        value: p.id,
        label: r?.nivel === 'bloqueo'
          ? t('plantillas.enviar.opcionBloqueada', { nombre: p.nombre })
          : r
            ? `${p.nombre} · ${etiquetaEstado(p.estado)}`
            : p.nombre,
      };
    }),
  ];
  // Each Select is remounted when its option list changes (the VisitaDialog
  // trap): inside a <form> Radix mirrors the value into a hidden native
  // <select>, and a value that changes in the same render as its options
  // arrive finds no <option> yet and collapses to ''.
  const claveDe = (opciones: { value: string }[]) => opciones.map((o) => o.value).join('|');

  const asunto = plantilla && canal === 'email' ? (idioma === 'en' ? plantilla.asunto_en : plantilla.asunto_es) ?? '' : '';
  const cuerpo = plantilla ? ((idioma === 'en' ? plantilla.cuerpo_en : plantilla.cuerpo_es) || plantilla.cuerpo_es) : '';

  const cambiarCanal = (c: string) => {
    setCanal(c as CanalMensaje);
    setPlantillaId('');
    setError(null);
  };

  const enviar = async () => {
    if (enviando) return;
    // The rules `required` cannot express, said when the send is asked for —
    // never as a primary greyed out for reasons the agent cannot see.
    if (!plantilla) { setError(t('plantillas.enviar.faltaPlantilla')); return; }
    if (reparo?.nivel === 'bloqueo') { setError(textoReparo()); return; }
    const falta = faltantes(variables, valores);
    if (falta.length) { setError(t('plantillas.enviar.faltaVariable', { nombre: falta[0] })); return; }
    setEnviando(true);
    setError(null);
    setCaducada(false);
    try {
      const r = await enviarPlantilla(canal, { lead_id: lead.id, plantilla: plantilla.clave, variables: valores }, locale);
      // `via` is the chassis's word (free_text, content); named in the locale
      // when the locale knows it, left out when it does not.
      const viaKey = r.via ? `plantillas.enviar.via.${r.via}` : '';
      const via = viaKey && t(viaKey) !== viaKey ? t(viaKey) : '';
      toast({
        tone: 'ok',
        title: t('plantillas.enviar.enviado', { nombre: lead.nombre, estado: t(`envio.${r.estado ?? 'enviado'}`) }),
        description: via ? t('plantillas.enviar.via', { via }) : t('plantillas.enviar.seguimiento'),
      });
      onSent();
    } catch (e) {
      // Said inside the dialog too: an open modal hides the toast from
      // assistive technology, and the form is kept so the agent can retry.
      // An expired session is not a send that failed: it is said in the app's
      // own words and answered with the way back in, not with "retry".
      const caducada = esSesionCaducada(e);
      const msg = caducada ? t('chasis.sesionCaducada') : t('plantillas.enviar.error', { error: (e as Error).message });
      setCaducada(caducada);
      setError(msg);
      toast({ title: msg, tone: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !enviando) onClose(); }}
      title={t('plantillas.enviar.titulo', { nombre: lead.nombre })}
      description={t('plantillas.enviar.ayuda', { idioma: t(`plantillas.idioma.${idioma}`) })}
      error={error}
      footer={(
        <>
          <button type="button" className="kit-btn kit-btn-ghost" onClick={onClose} disabled={enviando}>
            {t('plantillas.cancelar')}
          </button>
          {/* Never disabled for an incomplete form, only while sending: the
              form says what is missing when it is asked to send. A lead with
              neither phone nor email has no send at all, which is a different
              thing from a send that is not ready. */}
          {/* A send cannot be retried on a session that is over: the primary
              becomes the way back in, and the reload is what reopens the gate
              (nothing in this app listens for the sign-out event). */}
          {canales.length > 0 && caducada && (
            <button
              type="button"
              className="kit-btn kit-btn-primary"
              onClick={() => { signOutAndAnnounce(); location.reload(); }}
            >
              {t('chasis.volverAEntrar')}
            </button>
          )}
          {canales.length > 0 && !caducada && (
            <button type="submit" form="enviar-plantilla" className="kit-btn kit-btn-primary" disabled={enviando}>
              {enviando ? t('plantillas.enviar.enviando') : t('plantillas.enviar.enviar')}
            </button>
          )}
        </>
      )}
    >
      <form id="enviar-plantilla" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        {canales.length === 0 && <p className="aviso aviso-error" role="alert">{t('plantillas.enviar.sinCanal')}</p>}

        {canales.length > 0 && (<>
        <div className={canales.length > 1 ? 'campos-2 enviar-campos' : undefined}>
          {canales.length > 1 && (
            <div className="campo">
              <span>{t('plantillas.enviar.campo.canal')}</span>
              <Select
                key={claveDe(opcionesCanal)}
                value={canal}
                onValueChange={cambiarCanal}
                ariaLabel={t('plantillas.enviar.campo.canal')}
                options={opcionesCanal}
              />
            </div>
          )}
          <div className="campo">
            <span>{t('plantillas.enviar.campo.plantilla')}</span>
            {disponibles.length === 0
              ? <p className="pista">{t('plantillas.enviar.sinPlantillas', { canal: t(`plantillas.canal.${canal}`) })}</p>
              : (
                <Select
                  key={claveDe(opcionesPlantilla)}
                  value={plantillaId}
                  onValueChange={(v) => { setPlantillaId(v); setEdits({}); setError(null); }}
                  ariaLabel={t('plantillas.enviar.campo.plantilla')}
                  options={opcionesPlantilla}
                />
              )}
          </div>
        </div>

        {reparo && (
          <p className={`plantilla-reparo plantilla-reparo-${reparo.nivel}`} role="status">{textoReparo()}</p>
        )}

        {variables.length > 0 && (
          <fieldset className="variables-extra">
            <legend>{t('plantillas.enviar.campo.variables')}</legend>
            <p className="pista">{t('plantillas.enviar.variablesAyuda')}</p>
            {variables.map((v) => (
              <label className="campo" key={v}>
                <code>{v}</code>
                <input value={valores[v]} onChange={(e) => setEdits({ ...edits, [v]: e.target.value })} />
              </label>
            ))}
          </fieldset>
        )}

        {plantilla && (
          <div className="campo">
            <span>
              {t(via === 'content' ? 'plantillas.enviar.vistaPreviaContent' : 'plantillas.enviar.vistaPrevia',
                { idioma: t(`plantillas.idioma.${idioma}`) })}
            </span>
            {via === 'content' && <p className="pista">{t('plantillas.enviar.avisoContent')}</p>}
            <div className="plantilla-preview">
              {asunto && <strong>{render(asunto, valores)}</strong>}
              <p>{render(cuerpo, valores)}</p>
            </div>
          </div>
        )}
        </>)}
      </form>
    </Dialog>
  );
}
