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
  return /[<>\u0000-\u001f\u007f]/.test(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    if (!url || !secretKey || !publishableKey) return json({ error: 'server_not_configured' }, 500)

    // Pre-auth enrollment: validate this project's application key here instead of
    // requiring a user JWT before signup. This key never grants store membership.
    if (req.headers.get('apikey') !== publishableKey) {
      return json({ error: 'invalid_application_key' }, 403)
    }

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const userClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (!['https://obpkzecgswnfuyhwvncd.supabase.co','https://bhwuuxcrzxespkjlmqxr.supabase.co'].includes(url)) return json({error:'server_not_configured'},503)
    const raw=await req.text(); if(raw.length>8192)return json({error:'request_too_large'},413)
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request', message: '가입 정보를 확인해주세요.' }, 400)
    if (body.age_14_plus_confirmed !== true) {
      return json({ error: 'age_confirmation_required', message: '만 14세 이상임을 확인해 주세요. 확인 항목이 없으면 앱 업데이트 또는 화면 새로고침 후 가입해 주세요.' }, 400)
    }
    if (!Object.hasOwn(body, 'recovery_email')) {
      return json({error:'app_update_required',message:'이메일 등록 기능이 추가됐어요. 최신 앱으로 업데이트한 뒤 가입해 주세요.'},426)
    }
    const recoveryEmail = String(body.recovery_email ?? '').trim().toLowerCase()
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(recoveryEmail)
      || recoveryEmail.length>254 || recoveryEmail.split('@')[0].length>64 || recoveryEmail.includes('..') || recoveryEmail.split('@')[0].startsWith('.') || recoveryEmail.split('@')[0].endsWith('.')) {
      return json({error:'invalid_email',message:'이메일 주소를 정확히 입력해 주세요.'},400)
    }
    const username = normalizeUsername(body.username)
    const password = String(body.password ?? '')
    const displayName = String(body.display_name ?? body.name ?? '').normalize('NFKC').trim().slice(0, 50)

    if (!/^[a-z0-9가-힣._-]{6,30}$/.test(username)) {
      return json({ error: 'invalid_username', message: '아이디는 6~30자의 한글, 영문 소문자, 숫자, ., _, - 만 사용할 수 있습니다.' }, 400)
    }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return json({ error: 'invalid_password', message: '비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)' }, 400)
    }
    if (!displayName || unsafeDisplayText(displayName)) {
      return json({ error: 'invalid_display_name', message: '이름을 확인해주세요.' }, 400)
    }

    // Only new clients send personal. Existing signup clients retain their path.
    let personal: Record<string, string> | null = null
    if (Object.hasOwn(body, 'personal')) {
      if (!body.personal || typeof body.personal !== 'object' || Array.isArray(body.personal)) {
        return json({ error: 'invalid_personal_profile', message: '연락처를 확인해주세요.' }, 400)
      }
      personal = { phone: String(body.personal.phone ?? '').normalize('NFKC').trim() }
      if (personal.phone && (!/^[+0-9 ()-]{7,24}$/.test(personal.phone) ||
          personal.phone.replace(/[^0-9]/g, '').length < 7 || personal.phone.replace(/[^0-9]/g, '').length > 15)) {
        return json({ error: 'invalid_personal_profile', message: '연락처를 확인해주세요.' }, 400)
      }
    }

    const ipHash = await sha256(clientIp(req))
    const userHash = await sha256(username)
    const { data: ipAllowed, error: ipLimitError } = await admin.rpc('consume_auth_rate_limit', {
      p_action: 'signup_ip', p_key_hash: ipHash, p_window_seconds: 3600, p_max_attempts: 5,
    })
    if (ipLimitError) return json({ error: 'rate_limit_check_failed' }, 500)
    if (!ipAllowed) return json({ error: 'rate_limited', message: '가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)

    const { data: userAllowed, error: userLimitError } = await admin.rpc('consume_auth_rate_limit', {
      p_action: 'signup_username', p_key_hash: userHash, p_window_seconds: 3600, p_max_attempts: 3,
    })
    if (userLimitError) return json({ error: 'rate_limit_check_failed' }, 500)
    if (!userAllowed) return json({ error: 'rate_limited', message: '가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)

    // Server-only lookup covers Auth profiles, legacy owners, and store ownership.
    // Fail closed: do not create an Auth user when reservation lookup is unavailable.
    const { data: usernameReserved, error: reservationError } = await admin.rpc('is_manee_username_reserved', {
      p_username: username,
    })
    if (reservationError || typeof usernameReserved !== 'boolean') {
      return json({ error: 'username_lookup_failed', message: '아이디를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' }, 503)
    }
    if (usernameReserved) return json({ error: 'username_taken', message: '이미 사용 중인 아이디입니다. 기존 계정은 로그인해주세요.' }, 409)

    // Availability is rechecked on the server even after the form's duplicate check.
    const {data:emailCheck,error:emailCheckError}=await admin.rpc('manee_email_service',{p_action:'check',p_payload:{email:recoveryEmail}})
    if(emailCheckError || !emailCheck?.ok)return json({error:'email_lookup_failed',message:'이메일 중복 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},503)
    if(emailCheck.available!==true)return json({error:'email_taken',message:'이미 사용 중인 이메일 주소예요. 다른 이메일을 입력하거나 기존 계정으로 로그인해 주세요.'},409)

    if (!/^[0-9a-f-]{36}$/.test(String(body.sms_challenge_id||'')) || !/^[0-9a-f]{64}$/.test(String(body.sms_proof||''))) {
      return json({error:'phone_verification_required',message:'최신 앱에서 휴대폰 문자 인증을 완료해 주세요.'},400)
    }
    const {data:smsClaim,error:smsClaimError}=await admin.rpc('manee_sms_service',{p_action:'claim',p_payload:{
      id:body.sms_challenge_id,purpose:'signup_staff',username,proof_hash:await sha256(body.sms_proof)
    }})
    if(!smsClaimError && smsClaim?.error==='phone_taken')return json({error:'phone_taken',message:'이 휴대폰 번호로 가입된 아이디가 있어요. 기존 계정으로 로그인하거나 아이디·비밀번호 찾기를 이용해 주세요.'},409)
    if(smsClaimError || !smsClaim?.ok)return json({error:'phone_verification_required',message:'휴대폰 인증이 만료됐거나 이미 사용됐어요. 다시 인증해 주세요.'},400)
    personal={phone:'0'+smsClaim.phone.slice(3)}
    const internalEmail = `u-${crypto.randomUUID().replaceAll('-', '')}@auth.manee.local`
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: internalEmail, password, email_confirm: true,
      app_metadata: { manee_age_14_plus_confirmed: true, manee_age_confirmation_at: new Date().toISOString(),
        manee_age_confirmation_version: '14plus-2026-10-16', manee_age_confirmation_source: 'self-attestation' },
    })
    // A definitive weak-password rejection creates no identity. Restore only
    // this claimed signup proof so the user can correct the password in place.
    if (createError?.code === 'weak_password' && !created?.user) {
      const { data: released, error: releaseError } = await admin.rpc('manee_sms_service', {p_action:'release_signup',p_payload:{
        id:body.sms_challenge_id,operation_id:smsClaim.operation_id,purpose:'signup_staff',username,
        proof_hash:await sha256(body.sms_proof),reason:'weak_password'
      }})
      const retryable = !releaseError && released?.ok === true
      return json({ error:'weak_password', phone_verification_retained:retryable,
        message:'보안상 사용할 수 없는 비밀번호예요. 흔한 단어나 반복 숫자를 피하고 다른 비밀번호를 입력해 주세요. '+
          (retryable?'휴대폰 인증은 유효시간 안에 그대로 사용할 수 있어요.':'비밀번호를 변경한 뒤 휴대폰 문자 인증을 다시 해 주세요.') },400)
    }
    if (createError || !created?.user) return json({ error: 'auth_create_failed', message: '계정을 만들 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500)

    // Reserve against concurrent signups before any store/staff bootstrap. Auth
    // cleanup cascades only this new account's pending-email reservation.
    const {data:emailRegistered,error:emailRegisterError}=await admin.rpc('manee_email_service',{p_action:'register',p_payload:{user_id:created.user.id,email:recoveryEmail}})
    if(emailRegisterError || !emailRegistered?.ok){
      const {error:cleanupError}=await admin.auth.admin.deleteUser(created.user.id)
      if(cleanupError)return json({error:'signup_cleanup_failed',message:'가입 상태를 확인하지 못했어요. 고객지원에 문의해 주세요.'},503)
      const {data:released,error:releaseError}=await admin.rpc('manee_sms_service',{p_action:'release_signup',p_payload:{
        id:body.sms_challenge_id,operation_id:smsClaim.operation_id,purpose:'signup_staff',username,
        proof_hash:await sha256(body.sms_proof),reason:'bootstrap_rolled_back',cleaned_user_id:created.user.id
      }})
      const retryable=!releaseError && released?.ok===true
      const taken=!emailRegisterError && emailRegistered?.error==='email_taken'
      return json({error:taken?'email_taken':'email_registration_failed',phone_verification_retained:retryable,
        message:(taken?'이미 사용 중인 이메일 주소예요. 다른 이메일을 입력해 주세요.':'이메일 등록 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')+
          (retryable?' 휴대폰 인증은 유효시간 안에 그대로 사용할 수 있어요.':' 휴대폰 문자 인증을 다시 해 주세요.')},taken?409:503)
    }


    const bootstrapArgs = { p_user_id: created.user.id, p_username: username, p_display_name: displayName }
    const { data: staffId, error: bootstrapError } = personal
      ? await admin.rpc('bootstrap_staff_account_with_profile', { ...bootstrapArgs, p_personal: personal })
      : await admin.rpc('bootstrap_staff_account', bootstrapArgs)

    if (bootstrapError || !staffId) {
      // A lost RPC response must not delete an account whose bootstrap committed.
      const { data: recovered, error: recoveryError } = await admin.from('profiles')
        .select('user_id,username,status').eq('user_id', created.user.id).maybeSingle()
      if (recoveryError || recovered) {
        return json({ error: 'signup_result_uncertain', message: '가입 상태를 다시 확인해주세요. 입력한 아이디와 비밀번호로 로그인할 수 있습니다.' }, 503)
      }
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id)
      if (cleanupError) {
        console.error('staff_signup_cleanup_failed', created.user.id)
        return json({ error: 'signup_cleanup_failed', message: '계정 정리에 실패했습니다. 관리자에게 문의해주세요.' }, 503)
      }
      if (bootstrapError?.code === '23505') return json({ error: 'username_taken', message: '이미 사용 중인 아이디입니다.' }, 409)
      return json({ error: 'account_bootstrap_failed', message: '계정을 만들 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500)
    }

    const {data:smsBound,error:smsBindError}=await admin.rpc('manee_sms_service',{p_action:'complete',p_payload:{
      id:body.sms_challenge_id,operation_id:smsClaim.operation_id,user_id:created.user.id
    }})
    if(smsBindError || !smsBound?.ok)return json({error:'phone_binding_uncertain',message:'계정은 생성됐어요. 로그인 후 복구용 휴대폰 인증 상태를 확인해 주세요.'},503)

    const { data: loginData } = await userClient.auth.signInWithPassword({ email: internalEmail, password })

    return json({
      ok: true,
      user: { id: created.user.id, username, display_name: displayName || null },
      session: loginData.session ? {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
        expires_in: loginData.session.expires_in,
        expires_at: loginData.session.expires_at,
        token_type: loginData.session.token_type,
      } : null,
    }, 201)
  } catch {
    return json({ error: 'unexpected_error', message: '잠시 후 다시 시도해주세요.' }, 500)
  }
})
