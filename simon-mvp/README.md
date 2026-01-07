# Simon MVP - Frontend

Prototipo funcional del formulario VIVIENDA para Simon/SICI.

## Stack

- **Framework:** Next.js 14
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Backend:** Supabase (PostgreSQL)

## Setup

```bash
cd simon-mvp
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Configuracion Supabase (Opcional)

1. Copiar `.env.local.example` a `.env.local`
2. Agregar tus credenciales de Supabase:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
   ```

Sin configurar Supabase, el MVP funciona con datos mock.

## Estructura

```
simon-mvp/
├── src/
│   ├── components/       # Componentes React
│   │   ├── ProgressBar.tsx
│   │   ├── QuestionCard.tsx
│   │   ├── OptionButton.tsx
│   │   ├── NumberInput.tsx
│   │   └── TextInput.tsx
│   ├── data/
│   │   └── formQuestions.ts  # Preguntas del formulario
│   ├── hooks/
│   │   └── useForm.ts        # Estado del formulario
│   ├── pages/
│   │   ├── index.tsx         # Landing
│   │   ├── form.tsx          # Formulario
│   │   └── results.tsx       # Resultados + captura lead
│   └── styles/
│       └── globals.css       # Estilos globales
```

## Flujo

1. **Landing** (`/`) - CTA "Empezar"
2. **Formulario** (`/form`) - 39 preguntas, una a la vez
3. **Resultados** (`/results`) - Guia fiduciaria + propiedades + captura lead

## Funciones SQL Requeridas

- `buscar_unidades_reales(filtros JSONB)` - Busca propiedades
- `registrar_lead_mvp(...)` - Guarda el lead

## UX Features

- Una pregunta a la vez
- Barra de progreso por seccion
- Transiciones suaves con Framer Motion
- Navegacion con teclado (Enter = siguiente)
- Seleccion visual con feedback inmediato
- Quick buttons para numeros comunes

## Pendiente

- [ ] Conectar Claude API para guia fiduciaria real
- [ ] Notificacion Slack al registrar lead
- [ ] Metricas de abandono por seccion
