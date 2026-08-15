import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../lib/LocaleContext';
import { Kpi } from '../../components/kit';
import { ETAPAS, loadActividadesRecientes, loadLeads, type Actividad, type Lead } from '../../crm/api';
import { embudo, nuevos, periodos, procedencia, tiempoPrimeraRespuesta, variacion } from './informes';
import './informes.css';

// Lo que el CRM puede saber de sí mismo, y nada más.
//
// El diseño (6a) dibuja además visitas realizadas, comisión, no-shows y
// rendimiento por agente. No hay colección de visitas, ni campo de comisión, ni
// asignación de agente: esas cifras no se pueden calcular, así que no se pintan
// ni se rellenan con ceros. La nota al pie lo dice, para quien venga buscándolas.

const DIAS = 30;

export default function Informes() {
  const { t, locale } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [acts, setActs] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([loadLeads(), loadActividadesRecientes(500)])
      .then(([l, a]) => { setLeads(l); setActs(a); })
      .catch((e: Error) => setError(t('informes.error', { error: e.message })))
      .finally(() => setCargando(false));
  }, []);

  const ahora = Date.now();
  const { actual, previo } = useMemo(() => periodos(DIAS, ahora), [ahora]);
  const nActual = nuevos(leads, actual);
  const delta = variacion(nActual, nuevos(leads, previo));
  const respuesta = useMemo(
    () => tiempoPrimeraRespuesta(leads, acts, actual),
    [leads, acts, actual],
  );
  const funil = useMemo(() => embudo(leads, ETAPAS), [leads]);
  const origenes = useMemo(() => procedencia(leads, actual), [leads, actual]);
  const mayor = Math.max(1, ...funil.map((f) => f.n));

  return (
    <section className="informes">
      <h1>{t('informes.titulo')}</h1>
      <p className="informes-periodo">{t('informes.periodo', { dias: String(DIAS) })}</p>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="informes-vacio">{t('informes.cargando')}</p>}

      <div className="informes-kpis">
        <Kpi
          label={t('informes.kpi.nuevos')}
          value={nActual}
          of={delta === null ? undefined : t('informes.kpi.variacion', { pct: `${delta > 0 ? '+' : ''}${delta}` })}
        />
        <Kpi
          label={t('informes.kpi.respuesta')}
          value={respuesta.horas === null ? '—' : t('informes.kpi.horas', { h: String(respuesta.horas) })}
        />
        <Kpi label={t('informes.kpi.sinResponder')} value={respuesta.sinResponder} />
      </div>
      {respuesta.horas !== null && (
        <p className="informes-nota">{t('informes.medianaNota', { n: String(respuesta.medidos) })}</p>
      )}

      <h2>{t('informes.embudo')}</h2>
      <ul className="embudo">
        {funil.map(({ etapa, n }) => (
          <li key={etapa}>
            <span className="embudo-etapa">{t(`etapa.${etapa}`)}</span>
            {/* La barra es el dato, no un adorno: el ancho ES la proporción. */}
            <span className="embudo-barra" style={{ inlineSize: `${(n / mayor) * 100}%` }} aria-hidden="true" />
            <span className="embudo-n">{n}</span>
          </li>
        ))}
      </ul>

      <h2>{t('informes.procedencia')}</h2>
      {origenes.length === 0 && <p className="informes-vacio">{t('informes.sinDatos')}</p>}
      <ul className="procedencia">
        {origenes.map(({ origen, n }) => (
          <li key={origen}>
            <span>{origen === '(sin origen)' ? t('informes.sinOrigen') : origen}</span>
            <span className="procedencia-n">{n}</span>
          </li>
        ))}
      </ul>

      <p className="informes-pie" lang={locale}>{t('informes.pie')}</p>
    </section>
  );
}
