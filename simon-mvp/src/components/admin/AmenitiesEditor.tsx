/**
 * Amenidades + Equipamiento toggle sections
 * Extracted from propiedades/[id].tsx lines 2813-2941
 */
import { AMENIDADES_OPCIONES, EQUIPAMIENTO_OPCIONES } from '@/config/propiedad-constants'
import type { FormData } from '@/types/propiedad-editor'
import LockIcon from '@/components/admin/LockIcon'

interface AmenitiesEditorProps {
  formData: FormData
  estaCampoBloqueado: (campo: string) => boolean
  toggleBloqueo: (campo: string) => Promise<void>
  // Amenidades
  toggleAmenidad: (amenidad: string) => void
  nuevoAmenidad: string
  setNuevoAmenidad: (v: string) => void
  agregarAmenidadCustom: () => void
  eliminarAmenidadCustom: (amenidad: string) => void
  // Equipamiento
  toggleEquipamiento: (equip: string) => void
  nuevoEquipamiento: string
  setNuevoEquipamiento: (v: string) => void
  agregarEquipamientoCustom: () => void
  eliminarEquipamientoCustom: (equip: string) => void
}

export default function AmenitiesEditor(props: AmenitiesEditorProps) {
  const {
    formData, estaCampoBloqueado, toggleBloqueo,
    toggleAmenidad, nuevoAmenidad, setNuevoAmenidad, agregarAmenidadCustom, eliminarAmenidadCustom,
    toggleEquipamiento, nuevoEquipamiento, setNuevoEquipamiento, agregarEquipamientoCustom, eliminarEquipamientoCustom,
  } = props

  return (
    <>
      {/* Amenidades */}
      <section className={estaCampoBloqueado('amenities') ? 'bg-amber-50/30 rounded-lg p-4 -mx-4' : ''}>
        <h2 className="flex items-center text-lg font-semibold text-slate-900 mb-4">
          Amenidades del Edificio
          <LockIcon campo="amenities" estaCampoBloqueado={estaCampoBloqueado} toggleBloqueo={toggleBloqueo} />
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {AMENIDADES_OPCIONES.map((amenidad) => (
            <button
              key={amenidad}
              type="button"
              onClick={() => toggleAmenidad(amenidad)}
              className={`px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                formData.amenidades.includes(amenidad)
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <span className="text-sm font-medium">{amenidad}</span>
            </button>
          ))}
        </div>

        {formData.amenidades_custom.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-2">Amenidades personalizadas:</p>
            <div className="flex flex-wrap gap-2">
              {formData.amenidades_custom.map((amenidad) => (
                <span key={amenidad} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                  {amenidad}
                  <button type="button" onClick={() => eliminarAmenidadCustom(amenidad)} className="ml-1 text-blue-500 hover:text-blue-700">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoAmenidad}
            onChange={(e) => setNuevoAmenidad(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAmenidadCustom())}
            placeholder="Agregar otra amenidad..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
          />
          <button type="button" onClick={agregarAmenidadCustom} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
            + Agregar
          </button>
        </div>
      </section>

      {/* Equipamiento */}
      <section className={estaCampoBloqueado('equipamiento') ? 'bg-amber-50/30 rounded-lg p-4 -mx-4' : ''}>
        <h2 className="flex items-center text-lg font-semibold text-slate-900 mb-4">
          Equipamiento del Departamento
          <LockIcon campo="equipamiento" estaCampoBloqueado={estaCampoBloqueado} toggleBloqueo={toggleBloqueo} />
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {EQUIPAMIENTO_OPCIONES.map((equip) => (
            <button
              key={equip}
              type="button"
              onClick={() => toggleEquipamiento(equip)}
              className={`px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                formData.equipamiento.includes(equip)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <span className="text-sm font-medium">{equip}</span>
            </button>
          ))}
        </div>

        {formData.equipamiento_custom.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-2">Equipamiento adicional:</p>
            <div className="flex flex-wrap gap-2">
              {formData.equipamiento_custom.map((equip) => (
                <span key={equip} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                  {equip}
                  <button type="button" onClick={() => eliminarEquipamientoCustom(equip)} className="ml-1 text-blue-500 hover:text-blue-700">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoEquipamiento}
            onChange={(e) => setNuevoEquipamiento(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEquipamientoCustom())}
            placeholder="Agregar otro equipamiento..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
          <button type="button" onClick={agregarEquipamientoCustom} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
            + Agregar
          </button>
        </div>
      </section>
    </>
  )
}
