// ===== Supabase 로그인 / 회원가입 기능 모음 =====

// Supabase 클라이언트 만들기 (어디서든 window.sb 로 사용)
// 로그인 상태(세션)는 Supabase 가 브라우저에 자동 저장하므로, 새로고침해도 로그인이 유지돼요.
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 회원가입
// - 닉네임·치과 이름·전화번호를 유저 정보(metadata)에도 같이 저장해 둬요.
//   (이메일 인증이 켜져 있으면 가입 직후엔 로그인 상태가 아니라서 profiles 저장이 안 될 수 있어요.
//    그럴 땐 처음 로그인할 때 getProfile() 이 이 정보로 profiles 행을 만들어 줘요.)
// legal: 가입 화면에서 동의한 약관·개인정보 버전 { terms, privacy } — 유저 정보(metadata)에도 남겨 둬요
//        (이메일 인증 때문에 가입 직후 동의 기록을 못 하면, 첫 로그인 때 이 값으로 기록해요)
async function signUp(email, password, nickname, clinicName, phone, legal, address) {
  legal = legal || {};
  var result = await sb.auth.signUp({
    email: email,
    password: password,
    options: {
      // 인증 메일의 링크를 누르면 돌아올 주소 (config.js 의 SITE_URL)
      emailRedirectTo: SITE_URL + '/',
      data: {
        nickname: nickname, clinic_name: clinicName || '', phone: phone || '', address: address || '',
        accepted_terms_version: legal.terms || '', accepted_privacy_version: legal.privacy || ''
      }
    }
  });
  if (result.error) throw result.error;

  var user = result.data.user;

  // 이미 가입된 이메일이면 Supabase 가 identities 를 빈 배열로 돌려줘요
  if (user && user.identities && user.identities.length === 0) {
    throw new Error('already registered');
  }

  // 바로 로그인 상태가 됐다면 (이메일 인증이 꺼져 있는 경우) profiles 에 바로 저장
  if (result.data.session) {
    await createProfile(user.id, nickname, { clinic_name: clinicName, phone: phone, address: address });
  }

  return result.data; // data.session 이 없으면 → 이메일 인증이 필요하다는 뜻
}

// profiles 테이블에 새 행 저장
async function createProfile(userId, nickname, extra) {
  extra = extra || {};
  var row = { id: userId, nickname: nickname, lang: currentLang };
  if (extra.clinic_name) row.clinic_name = extra.clinic_name;
  if (extra.phone) row.phone = extra.phone;
  if (extra.address) row.address = extra.address;   // 치과 이름·주소·전화가 모두 있으면 DB 가 "등록된 치과 정보"로 잠가요 (sql/008)

  var result = await sb.from('profiles').insert(row).select().single();
  if (result.error) throw result.error;
  return result.data;
}

// 로그인
async function signIn(email, password) {
  var result = await sb.auth.signInWithPassword({ email: email, password: password });
  if (result.error) throw result.error;
  return result.data;
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
  var nickname = meta.nickname || user.email.split('@')[0];
  return await createProfile(user.id, nickname, { clinic_name: meta.clinic_name, phone: meta.phone, address: meta.address });
}
