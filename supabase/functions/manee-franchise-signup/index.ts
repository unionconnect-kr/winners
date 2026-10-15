import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

function getKey(envName: string, legacyName: string) {
  const raw = Deno.env.get(envName)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.default) return parsed.default as string
    } catch {}
  }
  return Deno.env.get(legacyName) ?? ''
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function clientIp(req: Request) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function normalizeUsername(input: unknown) {
  return String(input ?? '').normalize('NFKC').trim().toLowerCase()
}

function unsafeDisplayText(value: string) {
  if (value.includes("<") || value.includes(">")) return true
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || code === 127) return true
  }
  return false
}

// Only an active platform_admin (매니 본사) may create a franchise account.
// This is checked both here (fail fast, no auth.users row created for a
// rejected caller) and again inside bootstrap_franchise_account itself
// (the real security boundary, since it's the one thing a stray direct
// RPC call can't route around).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    if (!url || !secretKey || !publishableKey) return json({ error: 'server_not_configured' }, 500)

    if (req.headers.get('apikey') !== publishableKey) {
      return json({ error: 'invalid_application_key' }, 403)
    }

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return json({ error: 'invalid_session', message: '다시 로그인해 주세요.' }, 401)
    const { data: verified, error: verifyError } = await admin.auth.getUser(token)
    if (verifyError || !verified.user) { console.error('franchise_signup_verify_failed'); return json({ error: 'invalid_session', message: '다시 로그인해 주세요.' }, 401) }
    const actorId = verified.user.id

    const { data: isAdmin, error: adminCheckError } = await admin.from('platform_admins').select('user_id').eq('user_id', actorId).eq('status', 'active').maybeSingle()
    if (adminCheckError) console.error('franchise_signup_admin_check_error')
    if (!isAdmin) return json({ error: 'owner_required', message: '본사 관리자만 프랜차이즈 계정을 만들 수 있어요.' }, 403)

    const body = await req.json().catch(() => ({}))
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request', message: '가입 정보를 확인해주세요.' }, 400)
    if (body.age_14_plus_confirmed !== true) {
      return json({ error: 'age_confirmation_required', message: '만 14세 이상임을 확인해 주세요. 확인 항목이 없으면 앱 업데이트 또는 화면 새로고침 후 가입해 주세요.' }, 400)
    }
    const username = normalizeUsername(body.username)
    const password = String(body.password ?? '')
    const displayName = String(body.display_name ?? body.name ?? '').normalize('NFKC').trim().slice(0, 50)
    const franchiseName = String(body.franchise_name ?? '').normalize('NFKC').trim().slice(0, 50)

    if (!/^[a-z0-9가-힣._-]{4,30}$/.test(username)) {
      return json({ error: 'invalid_username', message: '아이디는 4~30자의 한글, 영문 소문자, 숫자, ., _, - 만 사용할 수 있습니다.' }, 400)
    }
    if (password.length < 8 || password.length > 72) {
      return json({ error: 'invalid_password', message: '비밀번호는 8~72자로 입력해주세요.' }, 400)
    }
    if (!displayName || unsafeDisplayText(displayName)) {
      return json({ error: 'invalid_display_name', message: '담당자 이름을 확인해주세요.' }, 400)
    }
    if (!franchiseName || unsafeDisplayText(franchiseName)) {
      return json({ error: 'invalid_franchise_name', message: '프랜차이즈 이름을 확인해주세요.' }, 400)
    }

    const actorHash = await sha256(actorId)
    const { data: actorAllowed, error: actorLimitError } = await admin.rpc('consume_auth_rate_limit', {
      p_action: 'franchise_signup_actor', p_key_hash: actorHash, p_window_seconds: 3600, p_max_attempts: 20,
    })
    if (actorLimitError) { console.error('franchise_signup_rate_limit_error'); return json({ error: 'rate_limit_check_failed' }, 500) }
    if (!actorAllowed) return json({ error: 'rate_limited', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)

    const { data: usernameReserved, error: reservationError } = await admin.rpc('is_manee_username_reserved', {
      p_username: username,
    })
    if (reservationError || typeof usernameReserved !== 'boolean') {
      console.error('franchise_signup_username_lookup_error')
      return json({ error: 'username_lookup_failed', message: '아이디를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' }, 503)
    }
    if (usernameReserved) return json({ error: 'username_taken', message: '이미 사용 중인 아이디입니다.' }, 409)

    const internalEmail = `u-${crypto.randomUUID().replaceAll('-', '')}@auth.manee.local`
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: internalEmail, password, email_confirm: true,
      app_metadata: { manee_age_14_plus_confirmed: true, manee_age_confirmation_at: new Date().toISOString(),
        manee_age_confirmation_version: '14plus-2026-10-16', manee_age_confirmation_source: 'admin-attestation' },
    })
    if (createError || !created.user) { console.error('franchise_signup_create_user_error'); return json({ error: 'auth_create_failed', message: '계정을 만들 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500) }

    const { data: franchiseId, error: bootstrapError } = await admin.rpc('bootstrap_franchise_account', {
      p_actor: actorId,
      p_user_id: created.user.id,
      p_username: username,
      p_display_name: displayName,
      p_franchise_name: franchiseName,
    })
    if (bootstrapError) console.error('franchise_signup_bootstrap_error')

    if (bootstrapError || !franchiseId) {
      const { data: recovered, error: recoveryError } = await admin.from('profiles')
        .select('user_id,username,status').eq('user_id', created.user.id).maybeSingle()
      if (recoveryError || recovered) {
        return json({ error: 'signup_result_uncertain', message: '가입 상태를 다시 확인해주세요.' }, 503)
      }
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id)
      if (cleanupError) {
        console.error('franchise_signup_cleanup_failed')
        return json({ error: 'signup_cleanup_failed', message: '계정 정리에 실패했습니다. 관리자에게 문의해주세요.' }, 503)
      }
      if (bootstrapError?.code === '23505') return json({ error: 'username_taken', message: '이미 사용 중인 아이디입니다.' }, 409)
      if (bootstrapError?.message?.includes('Owner permission required')) return json({ error: 'owner_required', message: '본사 관리자만 프랜차이즈 계정을 만들 수 있어요.' }, 403)
      return json({ error: 'account_bootstrap_failed', message: '계정을 만들 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500)
    }

    return json({ ok: true, franchise: { id: franchiseId, name: franchiseName }, user: { id: created.user.id, username } }, 201)
  } catch (e) {
    console.error('franchise_signup_unexpected_error')
    return json({ error: 'unexpected_error', message: '잠시 후 다시 시도해주세요.' }, 500)
  }
})
