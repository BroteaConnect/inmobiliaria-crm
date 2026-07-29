import { useEffect, useState } from 'react';
import { ETAPAS, type Etapa, type Lead, loadLeads, moverLead, anotar, onLeadsChange, waLink } from './api';

const TITULOS: Record<Etapa, string> = {
  nuevo: 'Nuevos', contactado: 'Contactados', visita: 'Visita', oferta: 'Oferta',
  reservado: 'Reservados', vendido: 'Vendidos', nutriendo: 'En cartera',
};

export default function Kanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nota, setNota] = useState<Record<string, string>>({});

  const recargar = () => loadLeads().then(setLeads).catch(() => {});
  useEffect(() => { recargar(); return onLeadsChange(recargar); }, []);

  const mover = async (l: Lead, dir: 1 | -1) => {
    const i = ETAPAS.indexOf(l.etapa) + dir;
    if (i < 0 || i >= ETAPAS.length) return;
    await moverLead(l.id, ETAPAS[i]);
    recargar();
  };

  const guardarNota = async (l: Lead) => {
    const texto = nota[l.id]?.trim();
    if (!texto) return;
    await anotar(l.id, 'nota', texto);
    setNota((n) => ({ ...n, [l.id]: '' }));
  };

  return (
    <div className="kanban">
      {ETAPAS.map((etapa) => (
        <section key={etapa} className={`col col-${etapa}`}>
          <h2>{TITULOS[etapa]} <span className="n">{leads.filter((l) => l.etapa === etapa).length}</span></h2>
          {leads.filter((l) => l.etapa === etapa).map((l) => (
            <article key={l.id} className="lead">
              <strong>{l.nombre}</strong>
              {l.expand?.propiedad && <span className="prop">🏠 {l.expand.propiedad.titulo}</span>}
              {l.mensaje && <p className="msg">“{l.mensaje}”</p>}
              <div className="acciones">
                {l.telefono && <a href={`tel:${l.telefono}`}>📞</a>}
                {waLink(l) && <a href={waLink(l)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                {l.email && <a href={`mailto:${l.email}`}>✉️</a>}
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
  );
}
