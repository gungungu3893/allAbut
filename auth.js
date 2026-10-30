// ===== Supabase 로그인 / 회원가입 기능 모음 =====

// Supabase 클라이언트 만들기 (어디서든 window.sb 로 사용)
// 로그인 상태(세션)는 Supabase가 브라우저에 자동 저장하므로, 새로고침해도 로그인이 유지돼요.
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 회원가입
// - 가입하면서 닉네임을 유저 정보(metadata)에도 같이 저장해 둬요.
//   (이메일 인증이 켜져 있으면 가입 직후엔 로그인 상태가 아니라서 profiles 저장이 안 될 수 있어요.
//    그럴 땐 처음 로그인할 때 getProfile() 이 이 닉네임으로 profiles 행을 만들어 줘요.)
async function signUp(email, password, nickname) {
  var result = await sb.auth.signUp({
    email: email,
    password: password,
    options: { data: { nickname: nickname } }
  });
  if (result.error) throw result.error;

  var user = result.data.user;

  // 이미 가입된 이메일이면 Supabase가 identities 를 빈 배열로 돌려줘요
  if (user && user.identities && user.identities.length === 0) {
    throw new Error('This email is already registered.');
  }

  // 바로 로그인 상태가 됐다면 (이메일 인증이 꺼져 있는 경우) profiles 에 바로 저장
  if (result.data.session) {
    await createProfile(user.id, nickname);
  }

  return result.data; // data.session 이 없으면 → 이메일 인증이 필요하다는 뜻
}

// profiles 테이블에 새 행 저장 (avatar 는 아직 없으니 null)
async function createProfile(userId, nickname) {
  var result = await sb
    .from('profiles')
    .insert({ id: userId, nickname: nickname, avatar: null })
    .select()
    .single();
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

// 로그인한 유저의 profiles 행 가져오기
// (행이 없으면 가입할 때 저장해 둔 닉네임으로 새로 만들어요)
async function getProfile() {
  var session = await getSession();
  if (!session) return null;

  var user = session.user;
  var result = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (result.error) throw result.error;

  if (result.data) return result.data;

  var nickname = (user.user_metadata && user.user_metadata.nickname) || user.email.split('@')[0];
  return await createProfile(user.id, nickname);
}
