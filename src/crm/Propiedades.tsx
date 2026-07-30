import { useEffect, useRef, useState } from 'react';
import {
  type Propiedad, type Propietario, loadPropiedades, loadPropietarios,
  crearPropiedad, actualizarPropiedad, fotoUrl, normalizaFoto, fmtPrecio,
} from './api';

export default function Propiedades() {
  const [props, setProps] = useState<Propiedad[]>([]);
  const [owners, setOwners] = useState<Propietario[]>([]);
  const [form, setForm] = useState<'cerrado' | 'nueva' | Propiedad>('cerrado');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const editando = typeof form === 'object' ? form : null;

  const recargar = () => { loadPropiedades().then(setProps); loadPropietarios().then(setOwners); };
  useEffect(recargar, []);

  // Al abrir en modo edición, lleva el formulario a la vista (la card
  // pulsada puede estar muy abajo en la rejilla).
  useEffect(() => {
    if (typeof form === 'object') {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [form]);

  const publicar = async (p: Propiedad) => {
    try {
      await actualizarPropiedad(p.id, { estado: p.estado === 'publicada' ? 'borrador' : 'publicada' });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: `No se pudo cambiar el estado: ${(err as Error).message}` });
    }
  };

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return; // doble submit: en edición duplicaría las fotos ('fotos+')
    const el = e.currentTarget;
    const raw = new FormData(el);
    setMsg(null);
    setEnviando(true);
    try {
      const texto = (k: string) => String(raw.get(k) ?? '').trim();
      const payload: Record<string, unknown> = { titulo: texto('titulo') };
      if (editando) {
        // PATCH: hay que enviar también los campos vacíos ('' limpia texto,
        // null limpia numéricos); si se omiten, un valor borrado en el form
        // persistiría silenciosamente en el backend. No se toca `estado`.
        for (const k of ['municipio', 'direccion', 'descripcion', 'propietario'] as const) {
          payload[k] = texto(k);
        }
        for (const k of ['precio', 'habitaciones', 'banos', 'superficie'] as const) {
          const v = Number(texto(k));
          payload[k] = texto(k) === '' || Number.isNaN(v) ? null : v;
        }
      } else {
        // Alta: payload explícito, solo campos con valor (un multipart con
        // partes vacías es justo lo que hacía tropezar al backend).
        payload.estado = 'borrador';
        for (const k of ['municipio', 'direccion', 'descripcion', 'propietario'] as const) {
          if (texto(k)) payload[k] = texto(k);
        }
        for (const k of ['precio', 'habitaciones', 'banos', 'superficie'] as const) {
          const v = texto(k) === '' ? undefined : Number(texto(k));
          if (v !== undefined && !Number.isNaN(v)) payload[k] = v;
        }
      }

      const brutas = (raw.getAll('fotos') as File[]).filter((f) => f && f.size > 0);
      if (brutas.length === 0) {
        if (editando) await actualizarPropiedad(editando.id, payload); // sin fotos → JSON puro
        else await crearPropiedad(payload);
      } else {
        setMsg({ tipo: 'ok', texto: 'Preparando fotos…' });
        const fotos = await Promise.all(brutas.map(normalizaFoto));
        const fd = new FormData();
        if (editando) {
          // PATCH multipart: los campos van en '@jsonPayload' (PocketBase lo
          // fusiona como JSON) para conservar los null que limpian numéricos —
          // como parte multipart vacía tropezarían con el backend.
          fd.append('@jsonPayload', JSON.stringify(payload));
        } else {
          for (const [k, v] of Object.entries(payload)) fd.append(k, String(v));
        }
        // En edición las fotos nuevas se AÑADEN ('fotos+', sintaxis de
        // PocketBase); 'fotos' a secas en un PATCH reemplazaría el set entero.
        for (const f of fotos) fd.append(editando ? 'fotos+' : 'fotos', f, f.name);
        if (editando) await actualizarPropiedad(editando.id, fd);
        else await crearPropiedad(fd);
      }
      el.reset();
      setForm('cerrado');
      setMsg({
        tipo: 'ok',
        texto: editando
          ? `"${payload.titulo}" actualizada.`
          : `"${payload.titulo}" guardada en borrador — revísala y publícala.`,
      });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: `No se pudo guardar: ${(err as Error).message}` });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="barra">
        <h1>Propiedades</h1>
        <button className="primario" onClick={() => setForm(form === 'cerrado' ? 'nueva' : 'cerrado')}>
          {form === 'cerrado' ? '+ Nueva propiedad' : 'Cancelar'}
        </button>
      </div>
      {msg && <p role="status" className={`aviso aviso-${msg.tipo}`}>{msg.texto}</p>}

      {form !== 'cerrado' && (
        <form
          ref={formRef}
          // owners.length en la key: si se abre en edición antes de que
          // carguen los propietarios, el select remonta con su defaultValue
          // ya resoluble (si no, quedaría en "—" y al guardar desvincularía).
          key={`${editando ? editando.id : 'nueva'}-${owners.length}`}
          className="alta"
          onSubmit={guardar}
        >
          <h2>{editando ? `Editar "${editando.titulo}"` : 'Nueva propiedad'}</h2>
          <div className="fila2">
            <label>Título <input name="titulo" required defaultValue={editando?.titulo ?? ''} /></label>
            <label>Municipio <input name="municipio" defaultValue={editando?.municipio ?? ''} /></label>
            <label>Dirección <input name="direccion" defaultValue={editando?.direccion ?? ''} /></label>
          </div>
          <div className="fila">
            <label>Precio € <input name="precio" type="number" min="0" defaultValue={editando?.precio ?? ''} /></label>
            <label>Hab. <input name="habitaciones" type="number" min="0" defaultValue={editando?.habitaciones ?? ''} /></label>
            <label>Baños <input name="banos" type="number" min="0" defaultValue={editando?.banos ?? ''} /></label>
            <label>m² <input name="superficie" type="number" min="0" defaultValue={editando?.superficie ?? ''} /></label>
          </div>
          <label>Descripción <textarea name="descripcion" rows={3} defaultValue={editando?.descripcion ?? ''} /></label>
          <label>Propietario
            <select name="propietario" defaultValue={editando?.propietario ?? ''}>
              <option value="">—</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          <label>Fotos <input name="fotos" type="file" accept="image/*" multiple />
            {editando && <span className="pista">Las fotos nuevas se añaden a las existentes.</span>}
          </label>
          <div className="acciones">
            <button className="primario" type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" disabled={enviando} onClick={() => setForm('cerrado')}>Cancelar</button>
          </div>
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
              <button onClick={() => setForm(p)}>Editar</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
