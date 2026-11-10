// ===== Supabase 로그인 / 회원가입 기능 모음 =====

// 비밀번호 재설정 메일의 링크로 들어왔는지 (Supabase 가 주소의 #...type=recovery 를 읽고 지우기 전에 기억해요)
window.__passwordRecovery = /[#&?]type=recovery\b/.test(String(location.hash || '') + String(location.search || ''));

// Supabase 클라이언트 만들기 (어디서든 window.sb 로 사용)
// 로그인 상태(세션)는 Supabase 가 브라우저에 자동 저장하므로, 새로고침해도 로그인이 유지돼요.
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 회원가입
//   info: { email, password, fullName, phone, clinicName, taxId, address, legal: { terms, privacy }, captchaToken }
//   - 필수 정보를 유저 정보(metadata)에도 같이 저장해 둬요.
//     (이메일 인증이 켜져 있으면 가입 직후엔 로그인 상태가 아니라서 profiles 저장이 안 될 수 있어요.
//      그럴 땐 처음 로그인할 때 getProfile() 이 이 정보로 profiles 행을 만들어 줘요.)
//   - legal: 가입 화면에서 동의한 약관·개인정보 버전 (이메일 인증 때문에 바로 기록을 못 하면 첫 로그인 때 이 값으로 기록)
//   - captchaToken: Turnstile 토큰 (TURNSTILE_SITE_KEY 가 비어 있으면 undefined → 안 보내요)
async function signUp(info) {
  var legal = info.legal || {};
  var fullName = cncNormName(info.fullName);
  var options = {
    // 인증 메일의 링크를 누르면 돌아올 주소 (config.js 의 SITE_URL)
    emailRedirectTo: SITE_URL + '/',
    data: {
      nickname: fullName, full_name: fullName, clinic_name: info.clinicName || '', phone: info.phone || '',
      address: info.address || '', tax_id: cncNormTaxId(info.taxId),
      accepted_terms_version: legal.terms || '', accepted_privacy_version: legal.privacy || ''
    }
  };
  if (info.captchaToken !== undefined) options.captchaToken = info.captchaToken;
  var result = await sb.auth.signUp({ email: info.email, password: info.password, options: options });
  if (result.error) throw result.error;

  var user = result.data.user;

  // 이미 가입된 이메일이면 Supabase 가 identities 를 빈 배열로 돌려줘요
  if (user && user.identities && user.identities.length === 0) {
    throw new Error('already registered');
  }

  // 바로 로그인 상태가 됐다면 (이메일 인증이 꺼져 있는 경우) profiles 에 바로 저장
  if (result.data.session) {
    await createProfile(user.id, fullName, {
      full_name: fullName, clinic_name: info.clinicName, phone: info.phone, address: info.address, tax_id: cncNormTaxId(info.taxId)
    });
  }

  return result.data; // data.session 이 없으면 → 이메일 인증이 필요하다는 뜻
}

// profiles 테이블에 새 행 저장
//   extra: { full_name, clinic_name, phone, address, tax_id } — 서버(sql/010 트리거)가 정규화·형식·중복을 다시 검사해요
//   sql/010 을 실행하기 전이면 full_name 칸이 없어서 실패 → 그 칸만 빼고 다시 저장
async function createProfile(userId, nickname, extra) {
  extra = extra || {};
  var row = { id: userId, nickname: nickname, lang: currentLang };
  if (extra.full_name) row.full_name = extra.full_name;
  if (extra.clinic_name) row.clinic_name = extra.clinic_name;
  if (extra.phone) row.phone = extra.phone;
  if (extra.address) row.address = extra.address;   // 치과 이름·주소·전화가 모두 있으면 DB 가 "등록된 치과 정보"로 잠가요 (sql/008)
  if (extra.tax_id) row.tax_id = extra.tax_id;

  var result = await sb.from('profiles').insert(row).select().single();
  if (result.error && row.full_name && /full_name|column/i.test(String(result.error.message || ''))) {
    delete row.full_name;
    result = await sb.from('profiles').insert(row).select().single();
  }
  if (result.error) throw result.error;
  return result.data;
}

// 로그인 (captchaToken: Turnstile 토큰, 없으면 안 보내요)
async function signIn(email, password, captchaToken) {
  var cred = { email: email, password: password };
  if (captchaToken !== undefined) cred.options = { captchaToken: captchaToken };
  var result = await sb.auth.signInWithPassword(cred);
  if (result.error) throw result.error;
  return result.data;
}

// 비밀번호 재설정 메일 보내기 → 링크를 누르면 SITE_URL 로 돌아와 새 비밀번호 화면
async function sendPasswordReset(email, captchaToken) {
  var opts = { redirectTo: SITE_URL + '/' };
  if (captchaToken !== undefined) opts.captchaToken = captchaToken;
  var result = await sb.auth.resetPasswordForEmail(email, opts);
  if (result.error) throw result.error;
}

// 새 비밀번호 저장 (재설정 링크로 들어와 잠깐 로그인된 상태에서)
async function updatePassword(password) {
  var result = await sb.auth.updateUser({ password: password });
  if (result.error) throw result.error;
}

// 로그아웃
async function signOut() {
  var result = await sb.auth.signOut();
  if (result.error) throw result.error;
}

// 지금 로그인되어 있는지 확인 (로그인 상태면 세션, 아니면 null)
async function getSession() {
  var result = await sb.auth.getSession();
  return result.data.session;
}

// 로그인한 유저의 profiles 행 가져오기 (없으면 가입할 때 저장해 둔 정보로 새로 만들어요)
async function getProfile() {
  var session = await getSession();
  if (!session) return null;
  var user = session.user;

  var result = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (result.error) throw result.error;
  if (result.data) return result.data;

  var meta = user.user_metadata || {};
  var nickname = meta.full_name || meta.nickname || user.email.split('@')[0];
  return await createProfile(user.id, nickname, {
    full_name: meta.full_name, clinic_name: meta.clinic_name, phone: meta.phone, address: meta.address, tax_id: meta.tax_id
  });
}
