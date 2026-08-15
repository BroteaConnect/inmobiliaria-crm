import { useState } from 'react';
import { useI18n } from '../lib/LocaleContext';
import { useSettings } from '../lib/SettingsContext';
import {
  NEGOCIO_REQUERIDO, adapterOf, moduleEnabled, negocioPendiente, textOf, type SettingValue,
} from '../lib/settings';
import { Button, Chip, Toggle } from '../components/kit';
import './ajustes.css';

// The configuration screen: which modules this CRM shows, and whether each
// integration is talking to a real service or to its mock.
//
// It exists so a module can ship dark. Everything the design proposes — the
// campaign sender, the drafting assistant, the reports — can land behind a
// switch that is off, be looked at by the person who asked for it, and be
// turned on without a deploy. The alternative is a branch that lives for weeks.

const MODULES = ['modules.today', 'modules.leads', 'modules.properties', 'modules.imports', 'modules.reports'] as const;
// Los datos del negocio, en el orden en que se leen en una página legal.
// `contacto.whatsapp` va con ellos porque es lo mismo: un dato del negocio que
// la web pública enseña, no una preferencia del CRM.
const NEGOCIO = [
  'negocio.razonSocial', 'negocio.nif', 'negocio.domicilio', 'negocio.registro',
  'negocio.telefono', 'negocio.email', 'contacto.whatsapp',
] as const;

const INTEGRATIONS = [
  'integrations.messaging',
  'integrations.drafting',
  'integrations.campaigns',
  'integrations.reports',
  'integrations.maps',
] as const;

/** `modules.today` → `today`, which is what the copy keys are named after. */
const shortKey = (key: string) => key.split('.')[1];

export default function Ajustes() {
  const { t } = useI18n();
  const { settings, ready, remote, save } = useSettings();
  const [failed, setFailed] = useState<string | null>(null);
  const pendientes = negocioPendiente(settings);

  const write = async (key: string, value: SettingValue) => {
    setFailed(null);
    try {
      await save(key, value);
    } catch {
      // The switch already moved — `save` is optimistic — so what this reports
      // is narrower and truer: it applies here, it did not travel.
      setFailed(key);
    }
  };

  return (
    <section className="ajustes">
      <h1>{t('ajustes.titulo')}</h1>
      <p className="ajustes-intro">{t('ajustes.intro')}</p>

      {ready && !remote && <p className="aviso" role="status">{t('ajustes.local')}</p>}
      {failed && <p className="error" role="alert">{t('ajustes.errorGuardar')}</p>}

      <h2>{t('ajustes.negocio')}</h2>
      <p className="ajustes-intro">{t('ajustes.negocio.intro')}</p>
      {pendientes.length > 0 && (
        <p className="aviso" role="status">
          {t('ajustes.negocio.pendiente', { n: String(pendientes.length) })}
        </p>
      )}
      <div className="ajustes-lista">
        {NEGOCIO.map((key) => {
          const corto = key.split('.')[1];
          const requerido = (NEGOCIO_REQUERIDO as readonly string[]).includes(key);
          return (
            <label className="campo" key={key}>
              {t(`ajustes.negocio.${corto}`)}
              {requerido && !textOf(settings, key) && <span className="campo-pendiente"> · {t('ajustes.negocio.falta')}</span>}
              <input
                defaultValue={textOf(settings, key)}
                placeholder={t(`ajustes.negocio.${corto}.ph`)}
                // Al salir del campo, no en cada tecla: un guardado por
                // pulsación llenaría el historial de la fila de versiones a
                // medio escribir.
                onBlur={(e) => {
                  const texto = e.target.value.trim();
                  if (texto !== textOf(settings, key)) write(key, { v: 1, text: texto });
                }}
              />
            </label>
          );
        })}
      </div>

      <h2>{t('ajustes.modulos')}</h2>
      <div className="ajustes-lista">
        {MODULES.map((key) => {
          const on = moduleEnabled(settings, key);
          return (
            <Toggle
              key={key}
              checked={on}
              label={t(`ajustes.modulo.${shortKey(key)}`)}
              hint={t(`ajustes.modulo.${shortKey(key)}.hint`)}
              onChange={(next) => write(key, { v: 1, enabled: next })}
            />
          );
        })}
      </div>

      <h2>{t('ajustes.integraciones')}</h2>
      <p className="ajustes-intro">{t('ajustes.integraciones.intro')}</p>
      <div className="ajustes-lista">
        {INTEGRATIONS.map((key) => {
          const live = adapterOf(settings, key) === 'live';
          return (
            <div className="ajustes-fila" key={key}>
              <div className="ajustes-fila-texto">
                <span className="ajustes-fila-nombre">{t(`ajustes.integracion.${shortKey(key)}`)}</span>
                <span className="ajustes-fila-hint">{t(`ajustes.integracion.${shortKey(key)}.hint`)}</span>
              </div>
              <Chip tone={live ? 'on' : 'off'}>{t(live ? 'ajustes.live' : 'ajustes.mock')}</Chip>
              <Button
                onClick={() => write(key, { v: 1, adapter: live ? 'mock' : 'live' })}
                aria-label={t(live ? 'ajustes.usarMockAria' : 'ajustes.usarLiveAria', {
                  nombre: t(`ajustes.integracion.${shortKey(key)}`),
                })}
              >
                {t(live ? 'ajustes.usarMock' : 'ajustes.usarLive')}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
