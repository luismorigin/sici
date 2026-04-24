#!/usr/bin/env node
// Set/reset password de un admin user en Supabase Auth.
// Bypassa el email de password recovery (útil cuando se alcanza el rate limit).
//
// Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// (leer desde simon-mvp/.env.local con --env-file de Node 20+)
//
// Uso (desde simon-mvp):
//   cd simon-mvp
//   node --env-file=.env.local scripts/set-admin-password.mjs <email> <nueva-password>
//
// Ejemplo:
//   node --env-file=.env.local scripts/set-admin-password.mjs directorcasapatio@gmail.com MiClaveSegura123

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Corré desde simon-mvp/: node --env-file=.env.local scripts/set-admin-password.mjs <email> <password>')
  process.exit(1)
}

const [, , email, password] = process.argv

if (!email || !password) {
  console.error('Uso (desde simon-mvp/): node --env-file=.env.local scripts/set-admin-password.mjs <email> <password>')
  process.exit(1)
}

if (password.length < 8) {
  console.error('ERROR: password debe tener al menos 8 caracteres.')
  process.exit(1)
}

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`🔍 Buscando user con email: ${email}`)

// listUsers() pagina con 50 por default. Para un proyecto con pocos admins alcanza.
const { data: { users }, error: listErr } = await supa.auth.admin.listUsers({ perPage: 200 })

if (listErr) {
  console.error('ERROR al listar users:', listErr.message)
  process.exit(1)
}

const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

if (!user) {
  console.error(`ERROR: no se encontró user con email "${email}". Verificá que existe en Supabase Auth.`)
  console.error(`Users encontrados: ${users.length}`)
  process.exit(1)
}

console.log(`✅ User encontrado: id=${user.id}, creado=${user.created_at}`)
console.log(`🔐 Seteando nueva password...`)

const { error: updErr } = await supa.auth.admin.updateUserById(user.id, { password })

if (updErr) {
  console.error('ERROR al actualizar password:', updErr.message)
  process.exit(1)
}

console.log('✅ Password actualizada. Podés loguearte en /admin/login con el modo "email + contraseña".')
