import { useEffect, useState } from 'react';
import {
  ETAPAS, ETIQUETA_CANAL, ETIQUETA_ENVIO, type Actividad, type Etapa, type Lead,
  anotar, desatendido, enviarEmail, haceCuanto, loadActividades, loadLeads,
  moverLead, onLeadsChange, registrarContacto, waLink,
} from './api';

const TITULOS: Record<Etapa, string> = {
  nuevo: 'Nuevos', contactado: 'Contactados', visita: 'Visita', oferta: 'Oferta',
  reservado: 'Reservados', vendido: 'Vendidos', nutriendo: 'En cartera',
};

export default function Kanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nota, setNota] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Actividad[]>([]);
  const [email, setEmail] = useState<{ lead: Lead; asunto: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState('');

  const recargar = () => loadLeads().then(setLeads).catch(() => {});
  useEffect(() => { recargar(); return onLeadsChange(recargar); }, []);

  const verHistorial = async (l: Lead) => {
    if (abierto === l.id) { setAbierto(null); return; }
    setAbierto(l.id);
    setHistorial(await loadActividades(l.id));
  };

  // Registramos el contacto que la agente inicia; abrir la app la hace el <a>.
  const contactar = async (l: Lead, canal: 'llamada' | 'whatsapp') => {
    await registrarContacto(l.id, canal,
      canal === 'whatsapp' ? 'Mensaje de WhatsApp enviado' : 'Llamada realizada');
    recargar();
    if (abierto === l.id) setHistorial(await loadActividades(l.id));
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
    await anotar(l.id, texto);
    setNota((n) => ({ ...n, [l.id]: '' }));
    if (abierto === l.id) setHistorial(await loadActividades(l.id));
  };

  const mandarEmail = async () => {
    if (!email) return;
    setAviso('Enviando email…');
    try {
      await enviarEmail(email.lead, email.asunto, email.texto);
      setAviso(`Email enviado a ${email.lead.nombre}. El seguimiento (entregado / abierto) aparecerá en su historial.`);
      setEmail(null);
      recargar();
    } catch (err) {
      setAviso(`No se pudo enviar: ${(err as Error).message}`);
    }
  };

  return (
    <>
      {aviso && <p role="status" className="aviso aviso-ok">{aviso}</p>}

      {email && (
        <div className="compositor">
          <h2>Email a {email.lead.nombre} <span className="dest">&lt;{email.lead.email}&gt;</span></h2>
          <label>Asunto
            <input value={email.asunto} onChange={(e) => setEmail({ ...email, asunto: e.target.value })} />
          </label>
          <label>Mensaje
            <textarea rows={6} value={email.texto} onChange={(e) => setEmail({ ...email, texto: e.target.value })} />
          </label>
          <div className="botones">
            <button className="primario" onClick={mandarEmail} disabled={!email.asunto || !email.texto}>Enviar</button>
            <button onClick={() => setEmail(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="kanban">
        {ETAPAS.map((etapa) => (
          <section key={etapa} className={`col col-${etapa}`}>
            <h2>{TITULOS[etapa]} <span className="n">{leads.filter((l) => l.etapa === etapa).length}</span></h2>
            {leads.filter((l) => l.etapa === etapa).map((l) => (
              <article key={l.id} className={`lead${desatendido(l) ? ' desatendido' : ''}`}>
                <strong>{l.nombre}</strong>
                {l.expand?.propiedad && <span className="prop">🏠 {l.expand.propiedad.titulo}</span>}
                <button className="seguimiento" onClick={() => verHistorial(l)} title="Ver historial de contactos">
                  {desatendido(l) ? '⚠ ' : ''}{haceCuanto(l.ultimo_contacto)}
                </button>
                {l.mensaje && <p className="msg">“{l.mensaje}”</p>}

                {abierto === l.id && (
                  <ul className="historial">
                    {historial.length === 0 && <li className="vacio">Sin contactos registrados</li>}
                    {historial.map((a) => (
                      <li key={a.id}>
                        <span>{ETIQUETA_CANAL[a.tipo] ?? a.tipo}</span>
                        <span className="cuando">{haceCuanto(a.created)}</span>
                        {a.estado_envio && ETIQUETA_ENVIO[a.estado_envio] && (
                          <span className={`envio envio-${a.estado_envio}`}>{ETIQUETA_ENVIO[a.estado_envio]}</span>
                        )}
                        {a.asunto && <span className="asunto">{a.asunto}</span>}
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
                      asunto: l.expand?.propiedad ? `Sobre ${l.expand.propiedad.titulo}` : 'Tu consulta',
                      texto: `Hola ${l.nombre},\n\nGracias por tu interés${l.expand?.propiedad ? ` en "${l.expand.propiedad.titulo}"` : ''}. ¿Te viene bien que hablemos esta semana?\n\nUn saludo,\nInmobiliaria`,
                    })}>✉️ Email</button>
                  )}
                </div>

                <div className="mover">
                  <button onClick={() => mover(l, -1)} disabled={l.etapa === ETAPAS[0]} aria-label="Etapa anterior">←</button>
                  <button onClick={() => mover(l, 1)} disabled={l.etapa === ETAPAS[ETAPAS.length - 1]} aria-label="Etapa siguiente">→</button>
                </div>
                <div className="notas">
                  <input placeholder="Añadir nota…" value={nota[l.id] ?? ''}
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
