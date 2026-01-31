/**
 * ProyectoAutocomplete - Autocomplete con herencia de datos de proyecto
 *
 * Busca en proyectos_master y permite "jalar" datos verificados:
 * - Amenidades del edificio
 * - Estado de construcción
 * - Fecha de entrega
 * - GPS verificado
 * - Desarrollador
 */

import { useState, useEffect, useRef } from 'react'

export interface ProyectoSugerencia {
  id_proyecto_master: number
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  estado_construccion: string | null
  fecha_entrega_estimada: string | null
  latitud: number | null
  longitud: number | null
  amenidades_edificio: string[]
  total_unidades: number
  verificado: boolean
}

interface Props {
  value: string
  onSelect: (proyecto: ProyectoSugerencia) => void
  onManualEntry: (nombre: string) => void
  placeholder?: string
  disabled?: boolean
  linkedProjectId?: number | null
}

export default function ProyectoAutocomplete({
  value,
  onSelect,
  onManualEntry,
  placeholder = "Buscar proyecto...",
  disabled = false,
  linkedProjectId
}: Props) {
  const [inputValue, setInputValue] = useState(value)
  const [suggestions, setSuggestions] = useState<ProyectoSugerencia[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Sync input with external value
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        // Si no seleccionó nada, usar entrada manual
        if (inputValue && !linkedProjectId) {
          onManualEntry(inputValue)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [inputValue, linkedProjectId, onManualEntry])

  // Buscar proyectos con debounce
  const searchProyectos = async (term: string) => {
    if (term.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/broker/buscar-proyectos?q=${encodeURIComponent(term)}&limit=8`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data)
        setIsOpen(data.length > 0)
        setSelectedIndex(-1)
      }
    } catch (err) {
      console.error('Error buscando proyectos:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)

    // Clear debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce search
    debounceRef.current = setTimeout(() => {
      searchProyectos(newValue)
    }, 300)
  }

  const handleSelect = (proyecto: ProyectoSugerencia) => {
    setInputValue(proyecto.nombre_oficial)
    setIsOpen(false)
    setSuggestions([])
    onSelect(proyecto)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelect(suggestions[selectedIndex])
        } else if (inputValue) {
          onManualEntry(inputValue)
          setIsOpen(false)
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  const handleClearLink = () => {
    onManualEntry(inputValue)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
          disabled={disabled}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
            linkedProjectId ? 'border-green-400 bg-green-50' : 'border-slate-300'
          }`}
          placeholder={placeholder}
        />

        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Linked indicator */}
        {linkedProjectId && !loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-green-600 text-sm">Vinculado</span>
            <button
              type="button"
              onClick={handleClearLink}
              className="text-slate-400 hover:text-slate-600 p-1"
              title="Desvincular proyecto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((proyecto, index) => (
            <button
              key={proyecto.id_proyecto_master}
              type="button"
              onClick={() => handleSelect(proyecto)}
              className={`w-full px-4 py-3 text-left hover:bg-amber-50 border-b border-slate-100 last:border-b-0 ${
                index === selectedIndex ? 'bg-amber-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">
                      {proyecto.nombre_oficial}
                    </span>
                    {proyecto.verificado && (
                      <span className="text-green-500 text-xs">GPS</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 truncate">
                    {proyecto.desarrollador || 'Desarrollador no especificado'}
                    {proyecto.zona && ` - ${proyecto.zona}`}
                  </div>
                  {proyecto.amenidades_edificio.length > 0 && (
                    <div className="text-xs text-slate-400 mt-1 truncate">
                      {proyecto.amenidades_edificio.slice(0, 4).join(', ')}
                      {proyecto.amenidades_edificio.length > 4 && ` +${proyecto.amenidades_edificio.length - 4}`}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-slate-400">
                    {proyecto.total_unidades} uds
                  </span>
                  {proyecto.estado_construccion && (
                    <div className="text-xs mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded ${
                        proyecto.estado_construccion === 'entrega_inmediata'
                          ? 'bg-green-100 text-green-700'
                          : proyecto.estado_construccion === 'construccion'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {proyecto.estado_construccion === 'entrega_inmediata' ? 'Entrega' :
                         proyecto.estado_construccion === 'construccion' ? 'Obra' :
                         proyecto.estado_construccion === 'preventa' ? 'Preventa' : 'Planos'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Opción de entrada manual */}
          <button
            type="button"
            onClick={() => {
              onManualEntry(inputValue)
              setIsOpen(false)
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 border-t border-slate-200"
          >
            Usar "{inputValue}" sin vincular a proyecto existente
          </button>
        </div>
      )}

      {/* Helper text */}
      {linkedProjectId && (
        <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Datos del edificio heredados (amenidades, GPS, estado)
        </p>
      )}
    </div>
  )
}
