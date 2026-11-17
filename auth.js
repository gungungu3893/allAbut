// ===== Supabase 로그인 / 회원가입 기능 모음 =====

// 비밀번호 재설정 메일의 링크로 들어왔는지 (Supabase 가 주소의 #...type=recovery 를 읽고 지우기 전에 기억해요)
window.__passwordRecovery = /[#&?]type=recovery\b/.test(String(location.hash || '') + String(location.search || ''));

// ----------------------------------------------------------------
// 로그인 토큰을 어디에 둘지 (계정 종류마다 다르게)
// ----------------------------------------------------------------
//   고객 계정: localStorage — 브라우저를 닫았다 열어도 남아 있어요 (1시간 세션 · 연장은 session.js)
//   직원 계정(admin_me() 로 역할이 있는 계정 — owner · manager · staff · sales):
//     sessionStorage — **브라우저 창(그 창의 모든 탭)을 닫으면 사라져요** = 창을 닫으면 로그아웃.
//     같은 창에서 새로고침 · 그 창에서 연 탭은 유지, 주소를 새로 친 새 탭은 다시 로그인.
//   로그인 직후 역할을 확인하고(app.js enterApp) 직원이면 useStaffSessionStorage() 가 토큰을 sessionStorage 로 옮기고 localStorage 것은 지워요.
//   그 뒤 Supabase 가 토큰을 새로 고칠 때도(자동 갱신) 아래 저장소가 sessionStorage 에만 써요.
var STAFF_SESSION_FLAG = 'allabut_staff_session';   // sessionStorage 에 '1' = 이 창은 직원 모드

function isStaffSessionMode() {
  try { return sessionStorage.getItem(STAFF_SESSION_FLAG) === '1'; } catch (e) { return false; }
}

// Supabase 로그인 저장소 (getItem · setItem · removeItem) — 직원 모드면 sessionStorage, 아니면 localStorage
var AUTH_STORAGE = {
  getItem: function (key) {
    try {
      if (isStaffSessionMode()) return sessionStorage.getItem(key);
      var v = localStorage.getItem(key);
      return v !== null ? v : sessionStorage.getItem(key);
    } catch (e) { return null; }
  },
  setItem: function (key, value) {
    try {
      if (isStaffSessionMode()) {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);   // 창을 닫아도 남는 곳에는 두지 않아요
      } else {
        localStorage.setItem(key, value);
      }
    } catch (e) { /* 저장 불가 (사생활 보호 모드 등) */ }
  },
  removeItem: function (key) {
    try { sessionStorage.removeItem(key); } catch (e) { /* 무시 */ }
    try { localStorage.removeItem(key); } catch (e) { /* 무시 */ }
  }
};

// Supabase 가 쓰는 로그인 키인지 (sb-<프로젝트>-auth-token … + 클라이언트가 알려 주는 실제 키 sb.auth.storageKey)
function isAuthStorageKey(key) {
  key = String(key || '');
  var own = window.sb && sb.auth && sb.auth.storageKey;
  return (own && (key === own || key.indexOf(own + '-') === 0)) || /^sb-.+-auth-token/.test(key);
}

// 직원 계정으로 확인됐을 때: 이 창을 직원 모드로 바꾸고 로그인 토큰을 sessionStorage 로 옮겨요 (localStorage 것은 지워요)
function useStaffSessionStorage() {
  try {
    sessionStorage.setItem(STAFF_SESSION_FLAG, '1');
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (isAuthStorageKey(k)) keys.push(k);
    }
    keys.forEach(function (k) {
      sessionStorage.setItem(k, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
  } catch (e) { /* 저장 불가 */ }
}

// 로그아웃 · 새 로그인 전에: 직원 모드 표시를 지워요 (다음 로그인은 고객처럼 시작 → 역할을 보고 다시 정해요)
function clearStaffSessionMode() {
  try { sessionStorage.removeItem(STAFF_SESSION_FLAG); } catch (e) { /* 무시 */ }
}

// Supabase 클라이언트 만들기 (어디서든 window.sb 로 사용) — 로그인 저장소는 위 AUTH_STORAGE
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: AUTH_STORAGE, persistSession: true, autoRefreshToken: true }
});

// 회원가입
//   info: { email, password, fullName, phone, clinicName, taxId, address, country, legal: { terms, privacy }, captchaToken, staffInvite }
//   - staffInvite: 직원 초대 링크의 토큰 (ui/page-join.js, sql/023). 메타데이터 staff_invite 로 넘기면 프로필이 만들어질 때
//     DB 트리거가 검증해서 직원 계정 + 역할을 정해요 (역할은 서버의 초대 기록에서만 — 브라우저 값은 안 믿어요). 틀리면 INVITE_INVALID
//   - 필수 정보를 유저 정보(metadata)에도 같이 저장해 둬요.
//     (이메일 인증이 켜져 있으면 가입 직후엔 로그인 상태가 아니라서 profiles 저장이 안 될 수 있어요.
//      그럴 땐 처음 로그인할 때 getProfile() 이 이 정보로 profiles 행을 만들어 줘요.)
//   - legal: 가입 화면에서 동의한 약관·개인정보 버전 (이메일 인증 때문에 바로 기록을 못 하면 첫 로그인 때 이 값으로 기록)
//   - captchaToken: Turnstile 토큰 (TURNSTILE_SITE_KEY 가 비어 있으면 undefined → 안 보내요)
async function signUp(info) {
  clearStaffSessionMode();   // 새 로그인은 고객 저장소로 시작 (직원 초대 가입이면 enterApp 이 직원 모드로 바꿔요)
  var legal = info.legal || {};
  var fullName = cncNormName(info.fullName);
  var options = {
    // 인증 메일의 링크를 누르면 돌아올 주소 (config.js 의 SITE_URL)
    emailRedirectTo: SITE_URL + '/',
    data: {
      nickname: fullName, full_name: fullName, clinic_name: info.clinicName || '', phone: info.phone || '',
      address: info.address || '', tax_id: cncNormTaxId(info.taxId, info.country), country: cncNormCountry(info.country || 'TH'),
      accepted_terms_version: legal.terms || '', accepted_privacy_version: legal.privacy || ''
    }
  };
  if (info.staffInvite) options.data.staff_invite = String(info.staffInvite);
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
      full_name: fullName, clinic_name: info.clinicName, phone: info.phone, address: info.address,
      tax_id: cncNormTaxId(info.taxId, info.country), country: cncNormCountry(info.country || 'TH')
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
  if (extra.country) row.country = cncNormCountry(extra.country);   // 치과 소재 국가 (sql/021 — 등록 정보와 함께 잠겨요)

  var result = await sb.from('profiles').insert(row).select().single();
  if (result.error && row.country && /country|column/i.test(String(result.error.message || ''))) {
    delete row.country;   // 021 실행 전
    result = await sb.from('profiles').insert(row).select().single();
  }
  if (result.error && row.full_name && /full_name|column/i.test(String(result.error.message || ''))) {
    delete row.full_name;
    result = await sb.from('profiles').insert(row).select().single();
  }
  if (result.error) throw result.error;
  return result.data;
}

// 로그인 (captchaToken: Turnstile 토큰, 없으면 안 보내요)
//   새 로그인은 항상 고객 저장소(localStorage)로 시작 → enterApp 이 역할을 보고 직원이면 sessionStorage 로 옮겨요
async function signIn(email, password, captchaToken) {
  clearStaffSessionMode();
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

// 새 비밀번호 저장 (재설정 링크로 들어와 잠깐 로그인된 상태에서 · 직원 내 정보의 비밀번호 변경)
//   비밀번호를 바꾸면 **다른 기기의 로그인은 모두 끊어요** (scope 'others' — 지금 이 기기는 그대로)
async function updatePassword(password) {
  var result = await sb.auth.updateUser({ password: password });
  if (result.error) throw result.error;
  try {
    var r2 = await sb.auth.signOut({ scope: 'others' });
    if (r2 && r2.error) console.warn('sign out other devices failed', r2.error);
  } catch (e) { console.warn('sign out other devices failed', e); }
}

// 로그아웃 (이 기기만) — scope 'global' 이면 모든 기기에서 (내 정보의 "모든 기기에서 로그아웃")
async function signOut(scope) {
  var result = await sb.auth.signOut(scope ? { scope: scope } : undefined);
  clearStaffSessionMode();
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
    full_name: meta.full_name, clinic_name: meta.clinic_name, phone: meta.phone, address: meta.address, tax_id: meta.tax_id,
    country: meta.country
  });
}
