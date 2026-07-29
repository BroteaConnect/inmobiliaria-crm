import { useEffect, useState } from 'react';
import {
  type Propiedad, type Propietario, loadPropiedades, loadPropietarios,
  crearPropiedad, actualizarPropiedad, fotoUrl,
} from './api';

const eur = (n: number) => n?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) ?? '—';

export default function Propiedades() {
  const [props, setProps] = useState<Propiedad[]>([]);
  const [owners, setOwners] = useState<Propietario[]>([]);
  const [alta, setAlta] = useState(false);

  const recargar = () => { loadPropiedades().then(setProps); loadPropietarios().then(setOwners); };
  useEffect(recargar, []);

  const publicar = async (p: Propiedad) => {
    await actualizarPropiedad(p.id, { estado: p.estado === 'publicada' ? 'borrador' : 'publicada' });
    recargar();
  };

  const crear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get('estado')) fd.set('estado', 'borrador');
    await crearPropiedad(fd);
    setAlta(false);
    recargar();
  };

  return (
    <div>
      <div className="barra">
        <h1>Propiedades</h1>
        <button className="primario" onClick={() => setAlta(!alta)}>{alta ? 'Cancelar' : '+ Nueva propiedad'}</button>
      </div>

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
              <span className="precio">{eur(p.precio)}</span>
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
