# Admin Dashboard para Alquileres

## Nuevas Páginas Admin

### 1. `/admin/alquiler/propiedades`

**Propósito:** Listado y edición de propiedades en alquiler.

#### Componente: `pages/admin/alquiler/propiedades.tsx`

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface PropiedadAlquiler {
  id: number;
  titulo: string;
  zona: string;
  status: string;
  datos_json_merged: {
    precio_alquiler_bs: number;
    expensas_bs: number;
    area_construida: number;
    dormitorios: number;
    banos: number;
    amoblado: boolean;
    acepta_mascotas: boolean;
  };
  fecha_ultima_actualizacion: string;
}

export default function AlquilerPropiedadesPage() {
  const [propiedades, setPropiedades] = useState<PropiedadAlquiler[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  useEffect(() => {
    fetchPropiedades();
  }, [filtroStatus]);

  const fetchPropiedades = async () => {
    setLoading(true);

    let query = supabase
      .from('propiedades_alquiler')
      .select('*')
      .order('fecha_ultima_actualizacion', { ascending: false });

    if (filtroStatus !== 'todos') {
      query = query.eq('status', filtroStatus);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching alquileres:', error);
    } else {
      setPropiedades(data || []);
    }

    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      discovery_completo: 'secondary',
      enrichment_completo: 'info',
      merge_completo: 'success',
      requiere_revision: 'warning',
      inactivo: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Propiedades en Alquiler</h1>
          <div className="flex gap-2">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-4 py-2 border rounded"
            >
              <option value="todos">Todos</option>
              <option value="discovery_completo">Discovery</option>
              <option value="enrichment_completo">Enrichment</option>
              <option value="merge_completo">Activos</option>
              <option value="requiere_revision">Requieren Revisión</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p>Cargando...</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {propiedades.map((prop) => (
              <div
                key={prop.id}
                className="border rounded-lg p-4 hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{prop.titulo}</h3>
                    <p className="text-gray-600">{prop.zona}</p>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span>
                        {prop.datos_json_merged?.dormitorios || 0} dorms
                      </span>
                      <span>
                        {prop.datos_json_merged?.banos || 0} baños
                      </span>
                      <span>
                        {prop.datos_json_merged?.area_construida || 0}m²
                      </span>
                      {prop.datos_json_merged?.amoblado && (
                        <Badge variant="outline">Amoblado</Badge>
                      )}
                      {prop.datos_json_merged?.acepta_mascotas && (
                        <Badge variant="outline">Acepta Mascotas</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(
                        prop.datos_json_merged?.precio_alquiler_bs || 0,
                        'BOB'
                      )}
                    </p>
                    {prop.datos_json_merged?.expensas_bs && (
                      <p className="text-sm text-gray-500">
                        + {formatCurrency(prop.datos_json_merged.expensas_bs, 'BOB')} expensas
                      </p>
                    )}
                    <div className="mt-2">{getStatusBadge(prop.status)}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/admin/alquiler/editar/${prop.id}`}>
                      Editar
                    </a>
                  </Button>
                  {prop.status === 'requiere_revision' && (
                    <Button variant="default" size="sm">
                      Validar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
```

---

### 2. `/admin/alquiler/editar/[id]`

**Propósito:** Editor individual de propiedad con candados.

#### Componente: `pages/admin/alquiler/editar/[id].tsx`

```typescript
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, Unlock } from 'lucide-react';

export default function EditarAlquilerPage() {
  const router = useRouter();
  const { id } = router.query;
  const [propiedad, setPropiedad] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [candados, setCandados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) {
      fetchPropiedad();
    }
  }, [id]);

  const fetchPropiedad = async () => {
    const { data, error } = await supabase
      .from('propiedades_alquiler')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error:', error);
    } else {
      setPropiedad(data);
      setCandados(data.campos_bloqueados || {});
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const { error } = await supabase
      .from('propiedades_alquiler')
      .update({
        datos_json_merged: propiedad.datos_json_merged,
        campos_bloqueados: candados,
        fecha_ultima_actualizacion: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      alert('✅ Guardado exitosamente');
      router.push('/admin/alquiler/propiedades');
    }

    setSaving(false);
  };

  const toggleCandado = (campo: string) => {
    setCandados({
      ...candados,
      [campo]: !candados[campo],
    });
  };

  if (loading) return <AdminLayout><p>Cargando...</p></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Editar Alquiler #{id}</h1>

        <div className="space-y-6">
          {/* Precio */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="font-semibold">Precio Alquiler (Bs)</label>
              <button onClick={() => toggleCandado('precio_alquiler')}>
                {candados.precio_alquiler ? (
                  <Lock className="w-5 h-5 text-red-500" />
                ) : (
                  <Unlock className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
            <Input
              type="number"
              value={propiedad.datos_json_merged?.precio_alquiler_bs || ''}
              onChange={(e) =>
                setPropiedad({
                  ...propiedad,
                  datos_json_merged: {
                    ...propiedad.datos_json_merged,
                    precio_alquiler_bs: parseFloat(e.target.value),
                  },
                })
              }
              disabled={candados.precio_alquiler}
            />
          </div>

          {/* Expensas */}
          <div className="border rounded-lg p-4">
            <label className="font-semibold">Expensas (Bs)</label>
            <Input
              type="number"
              value={propiedad.datos_json_merged?.expensas_bs || ''}
              onChange={(e) =>
                setPropiedad({
                  ...propiedad,
                  datos_json_merged: {
                    ...propiedad.datos_json_merged,
                    expensas_bs: parseFloat(e.target.value),
                  },
                })
              }
            />
          </div>

          {/* Dormitorios */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="font-semibold">Dormitorios</label>
              <button onClick={() => toggleCandado('dormitorios')}>
                {candados.dormitorios ? (
                  <Lock className="w-5 h-5 text-red-500" />
                ) : (
                  <Unlock className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
            <Input
              type="number"
              value={propiedad.datos_json_merged?.dormitorios || ''}
              onChange={(e) =>
                setPropiedad({
                  ...propiedad,
                  datos_json_merged: {
                    ...propiedad.datos_json_merged,
                    dormitorios: parseInt(e.target.value),
                  },
                })
              }
              disabled={candados.dormitorios}
            />
          </div>

          {/* Baños */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="font-semibold">Baños</label>
              <button onClick={() => toggleCandado('banos')}>
                {candados.banos ? (
                  <Lock className="w-5 h-5 text-red-500" />
                ) : (
                  <Unlock className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
            <Input
              type="number"
              value={propiedad.datos_json_merged?.banos || ''}
              onChange={(e) =>
                setPropiedad({
                  ...propiedad,
                  datos_json_merged: {
                    ...propiedad.datos_json_merged,
                    banos: parseInt(e.target.value),
                  },
                })
              }
              disabled={candados.banos}
            />
          </div>

          {/* Área */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="font-semibold">Área Construida (m²)</label>
              <button onClick={() => toggleCandado('area')}>
                {candados.area ? (
                  <Lock className="w-5 h-5 text-red-500" />
                ) : (
                  <Unlock className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
            <Input
              type="number"
              step="0.01"
              value={propiedad.datos_json_merged?.area_construida || ''}
              onChange={(e) =>
                setPropiedad({
                  ...propiedad,
                  datos_json_merged: {
                    ...propiedad.datos_json_merged,
                    area_construida: parseFloat(e.target.value),
                  },
                })
              }
              disabled={candados.area}
            />
          </div>

          {/* Checkboxes */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={propiedad.datos_json_merged?.amoblado || false}
                onCheckedChange={(checked) =>
                  setPropiedad({
                    ...propiedad,
                    datos_json_merged: {
                      ...propiedad.datos_json_merged,
                      amoblado: checked,
                    },
                  })
                }
              />
              <label>Amoblado</label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={propiedad.datos_json_merged?.acepta_mascotas || false}
                onCheckedChange={(checked) =>
                  setPropiedad({
                    ...propiedad,
                    datos_json_merged: {
                      ...propiedad.datos_json_merged,
                      acepta_mascotas: checked,
                    },
                  })
                }
              />
              <label>Acepta Mascotas</label>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
```

---

### 3. `/admin/alquiler/salud`

**Propósito:** Dashboard de salud del pipeline de alquileres.

#### Componente: `pages/admin/alquiler/salud.tsx`

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function AlquilerSaludPage() {
  const [metricas, setMetricas] = useState<any>(null);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Métricas generales
    const { data: metricasData } = await supabase
      .from('v_alquiler_metricas')
      .select('*')
      .single();

    // Últimas ejecuciones de workflows
    const { data: workflowsData } = await supabase
      .from('workflow_executions')
      .select('*')
      .ilike('workflow_name', '%alquiler%')
      .order('fecha_inicio', { ascending: false })
      .limit(10);

    setMetricas(metricasData);
    setWorkflows(workflowsData || []);
    setLoading(false);
  };

  if (loading) return <AdminLayout><p>Cargando...</p></AdminLayout>;

  const chartData = [
    { name: 'Discovery', value: metricas?.pendiente_enrichment || 0 },
    { name: 'Enrichment', value: metricas?.pendiente_merge || 0 },
    { name: 'Activas', value: metricas?.activas || 0 },
    { name: 'Revisión', value: metricas?.requieren_revision || 0 },
    { name: 'Inactivas', value: metricas?.inactivas || 0 },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Salud del Pipeline - Alquileres</h1>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <p className="text-sm text-gray-600">Total Propiedades</p>
            <p className="text-3xl font-bold">{metricas?.total_propiedades || 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-600">Activas</p>
            <p className="text-3xl font-bold text-green-600">
              {metricas?.activas || 0}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-600">Requieren Revisión</p>
            <p className="text-3xl font-bold text-orange-600">
              {metricas?.requieren_revision || 0}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-600">Precio Promedio</p>
            <p className="text-3xl font-bold">
              Bs {Math.round(metricas?.precio_promedio_bs || 0).toLocaleString()}
            </p>
          </Card>
        </div>

        {/* Gráfico */}
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Distribución por Status</h2>
          <BarChart width={600} height={300} data={chartData}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#8884d8" />
          </BarChart>
        </Card>

        {/* Últimos workflows */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Últimas Ejecuciones de Workflows</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Workflow</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="border-b">
                  <td className="py-2">{w.workflow_name}</td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        w.status === 'completado'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {new Date(w.fecha_inicio).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AdminLayout>
  );
}
```

---

## Funciones RPC Supabase

### Validar propiedad manualmente

```sql
CREATE OR REPLACE FUNCTION validar_alquiler_manual(
    p_propiedad_id INTEGER,
    p_correcciones JSONB,
    p_campos_bloqueados JSONB,
    p_usuario TEXT DEFAULT 'admin'
)
RETURNS TABLE(
    id INTEGER,
    accion TEXT,
    mensaje TEXT
) AS $$
BEGIN
    -- Aplicar correcciones
    UPDATE propiedades_alquiler
    SET
        datos_json_merged = datos_json_merged || p_correcciones,
        campos_bloqueados = campos_bloqueados || p_campos_bloqueados,
        status = 'merge_completo',
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{validacion_manual}',
            jsonb_build_object(
                'usuario', p_usuario,
                'fecha', NOW(),
                'correcciones_aplicadas', jsonb_object_keys(p_correcciones)
            )
        ),
        fecha_ultima_actualizacion = NOW()
    WHERE propiedades_alquiler.id = p_propiedad_id;

    RETURN QUERY SELECT
        p_propiedad_id,
        'validated'::TEXT,
        'Propiedad validada manualmente'::TEXT;
END;
$$ LANGUAGE plpgsql;
```

---

## Navegación en Admin Sidebar

Agregar en `components/layouts/AdminLayout.tsx`:

```typescript
const menuItems = [
  // ... items existentes ...
  {
    label: 'Alquileres',
    icon: HomeIcon,
    children: [
      { label: 'Propiedades', href: '/admin/alquiler/propiedades' },
      { label: 'Salud del Pipeline', href: '/admin/alquiler/salud' },
    ],
  },
];
```
