export const TERMS_VERSION = '2026-10-26';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json', 'Cache-Control': 'no-store'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const clean = value => typeof value === 'string' ? value.normalize('NFKC').trim() : '';
const safe = (value, max) => value.length >= 1 && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);
const emailAddress=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>value.length<=254&&value.split('@')[0]?.length<=64&&
  !value.split('@')[0]?.startsWith('.')&&!value.split('@')[0]?.endsWith('.')&&!value.split('@')[0]?.includes('..')&&
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function createHandler({ admin }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/i.test(authorization)) return json({ error: 'authentication_required', message: '다시 로그인해 주세요.' }, 401);
    try {
      const token = authorization.slice(7);
      const { data, error } = await admin.auth.getUser(token);
      const user = data?.user;
      if (error || !user) return json({ error: 'authentication_required', message: '다시 로그인해 주세요.' }, 401);
      let body;
      try {
        const text = await request.text();
        if (text.length > 8192) return json({ error: 'invalid_request' }, 413);
        body = JSON.parse(text);
      } catch { return json({ error: 'invalid_request' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || !['context', 'signup'].includes(body.action)) return json({ error: 'invalid_request' }, 400);
      // Provider evidence comes only from GoTrue's verified identities. Never
      // trust user_metadata, request user IDs, selected roles or email matching.
      const providers = [...new Set((user.identities || []).map(i => ({ kakao: 'kakao', 'custom:naver': 'naver', apple: 'apple' })[i.provider]).filter(Boolean))];
      const { data: profile, error: profileError } = await admin.from('profiles')
        .select('user_id,username,display_name,status').eq('user_id', user.id).maybeSingle();
      if (profileError) return json({ error: 'profile_unavailable', message: '계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
      if (profile && (profile.user_id !== user.id || profile.status !== 'active')) return json({ error: 'account_unavailable', message: '사용할 수 없는 계정이에요. 관리자에게 문의해 주세요.' }, 403);
      if (body.action === 'context') return json({ ok: true, userId: user.id, registered: !!profile, providers,
        displayName: profile?.display_name || '', termsVersion: TERMS_VERSION });
      if (profile) return json({ ok: true, alreadyRegistered: true, userId: user.id });
      if (!providers.includes(body.provider)) return json({ error: 'identity_required', message: '간편 로그인 인증을 먼저 완료해 주세요.' }, 403);
      const recoveryEmail=emailAddress(body.recovery_email);
      if(!validEmail(recoveryEmail))return json({error:'invalid_email',message:'이메일 주소를 정확히 입력하고 중복확인해 주세요.'},400);
      if(!uuid(body.sms_challenge_id)||typeof body.sms_proof!=='string'||!/^[0-9a-f]{64}$/.test(body.sms_proof)) {
        return json({error:'phone_verification_required',message:'휴대폰 문자 인증을 먼저 완료해 주세요.'},400);
      }
      let sessionId='';
      try{sessionId=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||'';}catch{}
      if(!uuid(sessionId))return json({error:'authentication_required',message:'다시 간편 로그인한 뒤 가입해 주세요.'},401);
      const displayName = clean(body.displayName), storeName = clean(body.storeName), franchiseCode = clean(body.franchiseCode);
      if (!['owner', 'staff'].includes(body.role) || !safe(displayName, 50) ||
          (body.role === 'owner' && !safe(storeName, 80)) || franchiseCode.length > 40 ||
          body.ageConfirmed !== true || body.termsAccepted !== true || body.privacyAccepted !== true ||
          body.termsVersion !== TERMS_VERSION || body.privacyVersion !== TERMS_VERSION) {
        return json({ error: 'signup_information_required', message: '이름·매장 정보와 필수 동의를 확인해 주세요.' }, 400);
      }
      const { data: allowed, error: limitError } = await admin.rpc('consume_auth_rate_limit', {
        p_action: 'social_signup', p_key_hash: user.id, p_window_seconds: 3600, p_max_attempts: 10
      });
      if (limitError) return json({ error: 'signup_unavailable', message: '가입을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
      if (!allowed) return json({ error: 'rate_limited', message: '가입 요청이 많아요. 잠시 후 다시 시도해 주세요.' }, 429);
      const payload = { provider: body.provider, role: body.role, displayName, storeName, franchiseCode,
        ageConfirmed: true, termsAccepted:true,privacyAccepted:true,termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION,
        recovery_email:recoveryEmail,session_id:sessionId,sms_challenge_id:body.sms_challenge_id,
        sms_proof_hash:await digest(body.sms_proof) };
      const { data: result, error: signupError } = await admin.rpc('manee_social_signup', { p_user_id: user.id, p_payload: payload });
      if (signupError) {
        if (String(signupError.message).includes('phone_taken')) return json({error:'phone_taken',message:'이 휴대폰 번호로 가입된 아이디가 있어요. 기존 계정으로 로그인하거나 아이디·비밀번호 찾기를 이용해 주세요.'},409);
        if (String(signupError.message).includes('email_taken')) return json({error:'email_taken',message:'이미 사용 중인 이메일 주소예요. 다른 이메일을 입력하거나 기존 계정으로 로그인해 주세요.'},409);
        if (String(signupError.message).includes('invalid_email')) return json({error:'invalid_email',message:'이메일 주소를 정확히 입력해 주세요.'},400);
        if (String(signupError.message).includes('phone_verification_required')) return json({error:'phone_verification_required',message:'휴대폰 인증이 만료됐거나 이미 사용됐어요. 다시 인증해 주세요.'},400);
        if (String(signupError.message).includes('invalid_franchise_code')) return json({ error: 'invalid_franchise_code', message: '프랜차이즈 코드를 확인해 주세요.' }, 400);
        return json({ error: 'signup_unavailable', message: '가입을 처리하지 못했어요. 입력 정보를 확인한 뒤 다시 시도해 주세요.' }, 503);
      }
      if (!result?.ok || result.userId !== user.id) return json({ error: 'signup_unavailable' }, 503);
      return json(result, result.alreadyRegistered ? 200 : 201);
    } catch { return json({ error: 'service_unavailable', message: '연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503); }
  };
}


