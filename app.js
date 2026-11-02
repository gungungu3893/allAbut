// ===== allAbut 메인 (시작 · 화면 전환 · 로그인/회원가입 폼) =====
// 화면은 3개예요:
//   landing — 다크 랜딩 (로고 + Start Order)
//   auth    — 로그인 / 회원가입
//   app     — 로그인 후 앱 (밝은 테마, 헤더 + 페이지). 페이지는 ui/router.js 가 그려요.

// 로그인한 사용자 정보 (다른 파일들이 함께 써요)
var APP = {
  user: null,      // Supabase 사용자 (id, email ...)
  profile: null,   // profiles 행
  balance: null,   // 크레딧 잔액
  isAdmin: false   // 관리자인지 (sb.rpc('is_admin'))
};


// ===== 화면 전환 (부드러운 페이드 0.4초) =====
var isSwitching = false;   // 전환 중인지
var pendingScreen = null;  // 전환 중에 들어온 다음 화면 요청 (전환이 끝나면 이어서 처리)

function showScreen(name) {
  if (isSwitching) {
    pendingScreen = name;
    return;
  }

  var next = document.getElementById('screen-' + name);
  var current = document.querySelector('.screen.active');
  if (!next || next === current) return;

  isSwitching = true;
  document.body.classList.toggle('in-app', name === 'app');   // 앱 화면은 밝은 배경

  // 1) 지금 화면을 투명하게
  if (current) current.classList.remove('visible');

  setTimeout(function () {
    // 2) 지금 화면 숨기고 다음 화면 보이기
    if (current) current.classList.remove('active');
    next.classList.add('active');
    window.scrollTo(0, 0);

    // 3) 다음 화면을 서서히 나타나게
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        next.classList.add('visible');
        isSwitching = false;

        // 전환 중에 들어온 요청이 있으면 이어서 처리
        if (pendingScreen) {
          var waiting = pendingScreen;
          pendingScreen = null;
          showScreen(waiting);
        }
      });
    });
  }, current ? 400 : 0);
}


// ===== 랜딩의 Start Order 버튼 =====
// 로그인 안 돼 있으면 → 로그인 화면, 돼 있으면 → 앱 홈
async function handleStartOrder() {
  var session = await getSession();

  // Supabase 로그인은 남아 있지만 1시간 세션이 끝났으면 → 로그아웃 처리
  if (session && getRemaining() <= 0) {
    await endSession('invalid');
    session = null;
  }

  if (session) {
    if (!/^#\/[a-z]+/.test(location.hash)) history.replaceState(null, '', '#/home');
    await enterApp();
  } else {
    resetAuthForms();
    switchTab('signin');
    showScreen('auth');
  }
}


// ===== 로그인 후 앱 열기 =====
async function enterApp() {
  try {
    var session = await getSession();
    if (!session) {
      showScreen('auth');
      return;
    }
    APP.user = session.user;
    var loaded = await Promise.all([getProfile(), cncCheckAdmin()]);
    APP.profile = loaded[0];
    APP.isAdmin = loaded[1];

    // 언어를 직접 고른 적이 없으면 프로필에 저장된 언어로
    if (!hasSavedLang() && APP.profile && APP.profile.lang && isSupportedLang(APP.profile.lang) && APP.profile.lang !== currentLang) {
      currentLang = APP.profile.lang;
      applyLangToDocument();
    }

    renderLayout();
    showScreen('app');
    startRouter();
    refreshBalance();
  } catch (err) {
    console.error(err);
    APP.user = null;
    APP.profile = null;
    switchTab('signin');
    showScreen('auth');
    showAuthMessage('signin-error', t('err_profile_load') + ' ' + (err.message || ''));
  }
}

// 헤더의 Sign Out 버튼
function handleSignOut() {
  endSession('manual');
}

// 세션이 끝날 때 (session.js 가 불러요): 작성 중인 주문 저장 + 앱 화면 정리
function onSessionEnded() {
  if (window.PageNew && PageNew.draft && PageNew.draftUser && !PageNew.success) {
    cncSaveDraft(PageNew.draftUser, PageNew.draft);
  }
  if (typeof stopRouterPage === 'function') stopRouterPage();
  if (typeof cncCloseViewer === 'function') cncCloseViewer();
  var modals = document.getElementById('modal-root');
  if (modals) modals.innerHTML = '';
  APP.user = null;
  APP.profile = null;
  APP.balance = null;
  APP.isAdmin = false;
}


// ===== 탭 전환 (Sign In / Create Account) =====
function switchTab(tab) {
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-signin').setAttribute('aria-selected', tab === 'signin' ? 'true' : 'false');
  document.getElementById('tab-signup').setAttribute('aria-selected', tab === 'signup' ? 'true' : 'false');
  document.getElementById('form-signin').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  clearAuthMessages();
}


// ===== 메시지 표시 =====
// type: 'error' (빨간 글씨) 또는 'info' (안내 글씨)
function showAuthMessage(id, text, type) {
  var el = document.getElementById(id);
  el.innerHTML = text ? '<span aria-hidden="true">' + (type === 'info' ? 'ℹ' : '⚠') + '</span> ' + escHtml(text) : '';
  el.className = 'auth-msg ' + (type === 'info' ? 'info' : 'error');
}

function clearAuthMessages() {
  ['signin-error', 'signup-error'].forEach(function (id) {
    var el = document.getElementById(id);
    el.textContent = '';
    el.className = 'auth-msg';
  });
}

function resetAuthForms() {
  document.getElementById('form-signin').reset();
  document.getElementById('form-signup').reset();
  clearAuthMessages();
}


// ===== 버튼 로딩 표시 =====
function setLoading(button, loading, labelKey) {
  button.disabled = loading;
  button.textContent = loading ? t('loading') : t(labelKey);
}


// ===== 입력값 검사 =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Supabase 에러 메시지를 알아보기 쉬운 문장으로 바꾸기
function friendlyError(err) {
  var msg = (err && err.message) || '';
  if (msg.indexOf('Invalid login credentials') !== -1) return t('err_login_invalid');
  if (msg.indexOf('Email not confirmed') !== -1) return t('err_email_not_confirmed');
  if (msg.indexOf('already registered') !== -1) return t('err_email_registered');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return t('err_network');
  return msg || t('err_unknown');
}


// ===== Sign In 버튼 =====
async function handleSignIn(event) {
  event.preventDefault(); // 페이지 새로고침 막기
  clearAuthMessages();

  var email = document.getElementById('signin-email').value.trim();
  var password = document.getElementById('signin-password').value;
  var button = document.getElementById('signin-btn');

  if (!isValidEmail(email)) return showAuthMessage('signin-error', t('err_email_invalid'));
  if (password.length < 6) return showAuthMessage('signin-error', t('err_password_short'));

  setLoading(button, true, 'btn_sign_in');
  try {
    await signIn(email, password);
    startSession(); // 로그인 성공 → 1시간 세션 시작
    if (!/^#\/[a-z]+/.test(location.hash)) history.replaceState(null, '', '#/home');
    await enterApp();
  } catch (err) {
    showAuthMessage('signin-error', friendlyError(err));
  } finally {
    setLoading(button, false, 'btn_sign_in');
  }
}


// ===== Create Account 버튼 =====
async function handleSignUp(event) {
  event.preventDefault();
  clearAuthMessages();

  var nickname = document.getElementById('signup-nickname').value.trim();
  var email = document.getElementById('signup-email').value.trim();
  var password = document.getElementById('signup-password').value;
  var password2 = document.getElementById('signup-password2').value;
  var clinic = document.getElementById('signup-clinic').value.trim();
  var phone = document.getElementById('signup-phone').value.trim();
  var button = document.getElementById('signup-btn');

  if (!nickname) return showAuthMessage('signup-error', t('err_nickname_required'));
  if (!isValidEmail(email)) return showAuthMessage('signup-error', t('err_email_invalid'));
  if (password.length < 6) return showAuthMessage('signup-error', t('err_password_short'));
  if (password !== password2) return showAuthMessage('signup-error', t('err_password_mismatch'));

  setLoading(button, true, 'btn_create_account');
  try {
    var data = await signUp(email, password, nickname, clinic, phone);

    if (data.session) {
      // 이메일 인증 없이 바로 로그인된 경우 → 1시간 세션 시작 + 홈으로
      startSession();
      history.replaceState(null, '', '#/home');
      await enterApp();
    } else {
      // 이메일 인증이 필요한 경우 → Sign In 탭으로 보내고 안내
      switchTab('signin');
      document.getElementById('signin-email').value = email;
      showAuthMessage('signin-error', t('signup_check_email'), 'info');
    }
  } catch (err) {
    showAuthMessage('signup-error', friendlyError(err));
  } finally {
    setLoading(button, false, 'btn_create_account');
  }
}


// ===== 랜딩·로그인 화면의 언어 선택 =====
function fillLangSelects() {
  var selects = document.querySelectorAll('.public-lang select');
  for (var i = 0; i < selects.length; i++) {
    selects[i].innerHTML = LANGUAGES.map(function (l) {
      return '<option value="' + l.code + '"' + (l.code === currentLang ? ' selected' : '') + '>' + escHtml(l.name) + '</option>';
    }).join('');
  }
}
window.addEventListener('langchange', fillLangSelects);


// ===== 페이지 처음 열릴 때 =====
(async function boot() {
  // 예전 메타버스 버전이 남긴 저장값 정리 (게임 위치)
  try { localStorage.removeItem('allabut_location'); } catch (e) { /* 무시 */ }

  applyLangToDocument();   // 저장된 언어 반영 (아랍어·페르시아어는 RTL)
  applyFontScale();        // 저장된 글자 크기 반영
  fillLangSelects();

  var kept = await checkSessionOnLoad();   // 1시간 세션이 남아 있는지 (session.js)
  if (kept) {
    await enterApp();                      // 새로고침해도 같은 페이지 (#/orders 등)
  } else {
    showScreen('landing');
  }
})();
