import { useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { Dialog } from '../components/ui';
import { Toggle } from '../components/kit';
import { crearPropietario, type Propietario } from './api';

// Adding the owner without leaving the property.
//
// This is the real shape of an intake: the flat and the person who owns it
// arrive in the same phone call, and until now the owner picker could only
// offer what somebody had already typed on another screen — a screen that does
// not exist in this CRM. The agent's way out was to save the property with no
// owner and never come back to it.
//
// A dialog and not a second sheet: the property is still the work, this is one
// question in the middle of it, and it is answered in four fields.

let seq = 0;

export function OwnerDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  /** The new owner, already stored. The caller links it and reloads. */
  onCreated: (owner: Propietario) => void;
}) {
  const { t } = useI18n();
  const [formId] = useState(() => `owner-form-${++seq}`);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpiar = () => {
    setNombre(''); setTelefono(''); setEmail(''); setConsentimiento(false); setError(null);
  };
  const cerrar = () => { if (!guardando) { limpiar(); onClose(); } };

  const guardar = async () => {
    if (guardando || !nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const creado = await crearPropietario({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        email: email.trim(),
        consentimiento,
        // The moment consent was given is the proof, so it is stored with it
        // and never guessed later from the row's creation date.
        ...(consentimiento ? { consentimiento_en: new Date().toISOString() } : {}),
      });
      limpiar();
      onCreated(creado);
    } catch (e) {
      setError(t('propietario.error', { error: (e as Error).message }));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) cerrar(); }}
      title={t('propietario.nuevoTitulo')}
      description={t('propietario.nuevoAyuda')}
      error={error}
      footer={(
        <>
          <button type="button" className="kit-btn kit-btn-ghost" disabled={guardando} onClick={cerrar}>
            {t('propietario.cancelar')}
          </button>
          <button type="submit" form={formId} className="kit-btn kit-btn-primary" disabled={guardando || !nombre.trim()}>
            {guardando ? t('propietario.guardando') : t('propietario.crear')}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <label className="campo">{t('propietario.campo.nombre')}
          <input value={nombre} autoFocus required onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo">{t('propietario.campo.telefono')}
          <input value={telefono} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label className="campo">{t('propietario.campo.email')}
          <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Toggle
          checked={consentimiento}
          onChange={setConsentimiento}
          label={t('propietario.consentimiento')}
          hint={t('propietario.consentimientoAyuda')}
        />
      </form>
    </Dialog>
  );
}
