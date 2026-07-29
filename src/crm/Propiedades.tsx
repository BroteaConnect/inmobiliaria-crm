import { useEffect, useState } from 'react';
import {
  type Propiedad, type Propietario, loadPropiedades, loadPropietarios,
  crearPropiedad, actualizarPropiedad, fotoUrl, normalizaFoto, fmtPrecio,
} from './api';

export default function Propiedades() {
  const [props, setProps] = useState<Propiedad[]>([]);
  const [owners, setOwners] = useState<Propietario[]>([]);
  const [alta, setAlta] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const recargar = () => { loadPropiedades().then(setProps); loadPropietarios().then(setOwners); };
  useEffect(recargar, []);

  const publicar = async (p: Propiedad) => {
    try {
      await actualizarPropiedad(p.id, { estado: p.estado === 'publicada' ? 'borrador' : 'publicada' });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: `No se pudo cambiar el estado: ${(err as Error).message}` });
    }
  };

  const crear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = new FormData(form);
    setMsg(null);
    try {
      // Payload explícito: solo campos con valor (un multipart con partes
      // vacías es justo lo que hacía tropezar al backend).
      const texto = (k: string) => String(raw.get(k) ?? '').trim();
      const num = (k: string) => (texto(k) === '' ? undefined : Number(texto(k)));
      const payload: Record<string, unknown> = { titulo: texto('titulo'), estado: 'borrador' };
      for (const k of ['municipio', 'direccion', 'descripcion', 'propietario'] as const) {
        if (texto(k)) payload[k] = texto(k);
      }
      for (const k of ['precio', 'habitaciones', 'banos', 'superficie'] as const) {
        const v = num(k);
        if (v !== undefined && !Number.isNaN(v)) payload[k] = v;
      }

      const brutas = (raw.getAll('fotos') as File[]).filter((f) => f && f.size > 0);
      if (brutas.length === 0) {
        await crearPropiedad(payload); // sin fotos → JSON puro, sin multipart
      } else {
        setMsg({ tipo: 'ok', texto: 'Preparando fotos…' });
        const fotos = await Promise.all(brutas.map(normalizaFoto));
        const fd = new FormData();
        for (const [k, v] of Object.entries(payload)) fd.append(k, String(v));
        for (const f of fotos) fd.append('fotos', f, f.name);
        await crearPropiedad(fd);
      }
      form.reset();
      setAlta(false);
      setMsg({ tipo: 'ok', texto: `"${payload.titulo}" guardada en borrador — revísala y publícala.` });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: `No se pudo guardar: ${(err as Error).message}` });
    }
  };

  return (
    <div>
      <div className="barra">
        <h1>Propiedades</h1>
        <button className="primario" onClick={() => setAlta(!alta)}>{alta ? 'Cancelar' : '+ Nueva propiedad'}</button>
      </div>
      {msg && <p role="status" className={`aviso aviso-${msg.tipo}`}>{msg.texto}</p>}

      {alta && (
        <form className="alta" onSubmit={crear}>
          <label>Título <input name="titulo" required /></label>
          <label>Municipio <input name="municipio" /></label>
          <label>Dirección <input name="direccion" /></label>
          <div className="fila">
            <label>Precio € <input name="precio" type="number" min="0" /></label>
            <label>Hab. <input name="habitaciones" type="number" min="0" /></label>
            <label>Baños <input name="banos" type="number" min="0" /></label>
            <label>m² <input name="superficie" type="number" min="0" /></label>
          </div>
          <label>Descripción <textarea name="descripcion" rows={3} /></label>
          <label>Propietario
            <select name="propietario">
              <option value="">—</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          <label>Fotos <input name="fotos" type="file" accept="image/*" multiple /></label>
          <button className="primario" type="submit">Guardar</button>
        </form>
      )}

      <div className="grid">
        {props.map((p) => (
          <article key={p.id} className="ficha">
            {fotoUrl(p) ? <img src={fotoUrl(p)} alt="" /> : <div className="sinfoto">📷</div>}
            <div className="cuerpo">
              <strong>{p.titulo}</strong>
              <span className="meta">{p.municipio} · {p.habitaciones ?? '–'} hab · {p.superficie ?? '–'} m²</span>
              <span className="precio">{fmtPrecio(p.precio)}</span>
              <span className={`estado estado-${p.estado}`}>{p.estado}</span>
              {(p.estado === 'borrador' || p.estado === 'publicada') && (
                <button onClick={() => publicar(p)}>
                  {p.estado === 'publicada' ? 'Retirar de la web' : 'Publicar en la web'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
