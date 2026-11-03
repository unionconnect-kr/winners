import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const LEGACY_RESET_WINDOW_MS = 24 * 60 * 60 * 1000

// Disabled 2026-09-18: 0 owner_requests rows currently need auto-migration
// (re-confirmed live before disabling), and the feature's own race-condition
// history (see winners/security/external-review-round3-fixes.sql,
// external-review-round4-fixes.sql) makes it worth keeping off until a real
// account actually needs it. Does NOT affect: existing migrated-account
// login (the `if (profile)` branch above this flag), manee-signup (new
// accounts), or manee-account-recovery (password reset) -- all fully
// separate code paths. To re-enable: flip this back to true, then re-run
// the round-3/4 concurrency tests before trusting it with real traffic
// again. private.issue_legacy_temp_password is unrelated -- it only issues
// a new temp password for a NOT-yet-migrated (legacy owner_requests) row;
// it explicitly rejects a username that already has a profiles/Auth
// account (round-6 review: this comment previously said the opposite).
const LEGACY_AUTO_MIGRATION_ENABLED = false

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
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function normalizeUsername(input: unknown) {
  return String(input ?? '').normalize('NFKC').trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    if (!url || !secretKey || !publishableKey) return json({ error: 'server_not_configured' }, 500)

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => ({}))
    const username = normalizeUsername(body.username)
    const password = String(body.password ?? '')
    const newPassword = body.new_password == null ? '' : String(body.new_password)
    const entryRole = body.role == null ? null : String(body.role)
    if (entryRole !== null && !['owner', 'staff'].includes(entryRole)) return json({error:'invalid_role',message:'로그인할 역할을 다시 선택해 주세요.'},400)

    if (!username || !password) {
      return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
    }

    const ipHash = await sha256(clientIp(req))
    const userHash = await sha256(username)
    const { data: ipAllowed, error: ipLimitError } = await admin.rpc('consume_auth_rate_limit', {
      p_action: 'login_ip', p_key_hash: ipHash, p_window_seconds: 300, p_max_attempts: 30,
    })
    if (ipLimitError) return json({ error: 'rate_limit_check_failed' }, 500)
    if (!ipAllowed) return json({ error: 'rate_limited', message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)

    const { data: userAllowed, error: userLimitError } = await admin.rpc('consume_auth_rate_limit', {
      p_action: 'login_username', p_key_hash: userHash, p_window_seconds: 300, p_max_attempts: 10,
    })
    if (userLimitError) return json({ error: 'rate_limit_check_failed' }, 500)
    if (!userAllowed) return json({ error: 'rate_limited', message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)

    async function signInExisting(profile: any) {
      if (!profile || profile.status !== 'active') return null
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.user_id)
      const internalEmail = userData?.user?.email
      if (userError || !internalEmail) return null
      const { data: loginData, error: loginError } = await userClient.auth.signInWithPassword({
        email: internalEmail,
        password,
      })
      if (loginError || !loginData.session || !loginData.user) return null
      return { loginData, internalEmail }
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('user_id,username,display_name,status')
      .eq('username', username)
      .maybeSingle()

    if (profileError) return json({ error: 'login_lookup_failed', message: '잠시 후 다시 시도해주세요.' }, 500)

    if (profile) {
      const signed = await signInExisting(profile)
      if (!signed) return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
      const { loginData } = signed
      if (entryRole) {
        // Use the authenticated server snapshot, never client-editable metadata.
        const {data:snapshot,error:roleError}=await userClient.rpc('manee_staff_portal',{p_action:'session',p_payload:{}})
        if (roleError || !snapshot?.ok || snapshot.profile?.user_id!==loginData.user.id) {
          await userClient.auth.signOut({scope:'local'})
          return json({error:'role_lookup_failed',message:'계정 정보를 확인하지 못했어요. 다시 시도해 주세요.'},503)
        }
        const roles=(snapshot.memberships||[]).map((m:any)=>m.role)
        const allowed=entryRole==='owner'?roles.includes('owner'):roles.some((r:string)=>['staff','manager'].includes(r))||roles.length===0
        if (!allowed) {
          await userClient.auth.signOut({scope:'local'})
          return json({error:'role_mismatch',message:entryRole==='staff'?'사장님 계정이에요. 사장님 로그인을 선택해 주세요.':'직원 계정이에요. 직원·매니저 로그인을 선택해 주세요.'},403)
        }
      }
      return json({
        ok: true,
        migrated: false,
        user: { id: loginData.user.id, username: profile.username, display_name: profile.display_name },
        session: {
          access_token: loginData.session.access_token,
          refresh_token: loginData.session.refresh_token,
          expires_in: loginData.session.expires_in,
          expires_at: loginData.session.expires_at,
          token_type: loginData.session.token_type,
        },
      })
    }

    if (!LEGACY_AUTO_MIGRATION_ENABLED) {
      return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
    }

    const legacyHash = await sha256(password)
    const { data: legacyRows, error: legacyError } = await admin
      .from('owner_requests')
      .select('id,name,store_name,password_hash,status,auth_user_id,reset_requested,reset_requested_at')
      .eq('username', username)
      .eq('status', 'approved')

    if (legacyError || !legacyRows || legacyRows.length === 0) {
      return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
    }

    const unclaimedRows = legacyRows.filter((r: any) => !r.auth_user_id)
    if (unclaimedRows.length === 0) {
      return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
    }

    const hashes = new Set(unclaimedRows.map((r: any) => String(r.password_hash ?? '')))
    if (hashes.size !== 1 || !hashes.has(legacyHash)) {
      return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
    }

    const forcedResetRow = unclaimedRows.find((r: any) => r.reset_requested === true)
    const forcedReset = !!forcedResetRow
    if (forcedReset) {
      const requestedAtMs = forcedResetRow.reset_requested_at ? new Date(forcedResetRow.reset_requested_at).getTime() : 0
      if (!requestedAtMs || Date.now() - requestedAtMs > LEGACY_RESET_WINDOW_MS) {
        return json({ error: 'invalid_credentials', message: '아이디 또는 비밀번호를 확인해주세요.' }, 401)
      }
    }

    let authPassword = password
    let upgradedPassword = false
    if (password.length < 8 || forcedReset) {
      if (!newPassword) {
        return json({
          error: 'legacy_password_upgrade_required',
          upgrade_required: true,
          message: forcedReset
            ? '보안을 위해 비밀번호를 새로 설정해주세요.'
            : '보안 로그인을 위해 비밀번호를 8자 이상으로 변경해주세요.',
        }, 409)
      }
      if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return json({ error: 'invalid_new_password', message: '새 비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)' }, 400)
      }
      if (newPassword === password) {
        return json({ error: 'invalid_new_password', message: '기존 비밀번호와 다른 새 비밀번호를 입력해주세요.' }, 400)
      }
      authPassword = newPassword
      upgradedPassword = true
    }

    const internalEmail = `u-${crypto.randomUUID().replaceAll('-', '')}@auth.manee.local`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: authPassword,
      email_confirm: true,
    })
    if (createError || !created.user) {
      return json({ error: 'migration_create_failed', message: '계정 보안 전환에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 500)
    }

    const createdUserId = created.user.id

    async function deleteOrphanedAuthUser(reason: string) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(createdUserId)
      if (deleteError) {
        console.error(`manee-login: failed to delete orphaned auth user ${createdUserId} (${reason}):`, deleteError)
      }
    }

    const migratedAt = new Date().toISOString()
    const { data: claimedRows, error: claimError } = await admin
      .from('owner_requests')
      .update({ auth_user_id: createdUserId, auth_migrated_at: migratedAt, reset_requested: false })
      .eq('username', username)
      .eq('status', 'approved')
      .eq('password_hash', legacyHash)
      .is('auth_user_id', null)
      .select('id')

    if (claimError || !claimedRows || claimedRows.length === 0) {
      await deleteOrphanedAuthUser('claim_conflict')
      return json({ error: 'migration_conflict', message: '처리 중 정보가 변경됩니다. 다시 로그인해주세요.' }, 409)
    }

    let storeCount = 0
    try {
      const { data: linkedStores, error: bootstrapError } = await admin.rpc('bootstrap_legacy_owner_account', {
        p_user_id: createdUserId,
        p_username: username,
      })
      if (bootstrapError) throw bootstrapError
      storeCount = Number(linkedStores || 0)
      if (!storeCount) throw new Error('no stores linked')
    } catch {
      await admin
        .from('owner_requests')
        .update({ auth_user_id: null, auth_migrated_at: null, reset_requested: forcedReset })
        .in('id', claimedRows.map((r: any) => r.id))
        .eq('auth_user_id', createdUserId)
      await deleteOrphanedAuthUser('bootstrap_failed')
      return json({ error: 'migration_link_failed', message: '계정 보안 전환에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 500)
    }

    const { data: loginData, error: loginError } = await userClient.auth.signInWithPassword({
      email: internalEmail,
      password: authPassword,
    })

    if (loginError || !loginData.session || !loginData.user) {
      await admin
        .from('owner_requests')
        .update({ auth_user_id: null, auth_migrated_at: null, reset_requested: forcedReset })
        .in('id', claimedRows.map((r: any) => r.id))
        .eq('auth_user_id', createdUserId)
      await deleteOrphanedAuthUser('signin_failed')
      return json({ error: 'migration_login_failed', message: '계정 보안 전환에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 500)
    }

    const { data: migratedProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', createdUserId)
      .maybeSingle()

    return json({
      ok: true,
      migrated: true,
      upgraded_password: upgradedPassword,
      owner_store_count: storeCount,
      user: {
        id: loginData.user.id,
        username,
        display_name: migratedProfile?.display_name ?? unclaimedRows[0]?.name ?? null,
      },
      session: {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
        expires_in: loginData.session.expires_in,
        expires_at: loginData.session.expires_at,
        token_type: loginData.session.token_type,
      },
    })
  } catch {
    return json({ error: 'unexpected_error', message: '잠시 후 다시 시도해주세요.' }, 500)
  }
})
