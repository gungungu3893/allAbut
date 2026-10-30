// allAbut 메인 앱 코드
console.log('allAbut 5μm loaded');


// ===== 화면 전환 (부드러운 페이드 0.4초) =====
var isSwitching = false; // 전환 중에 또 누르는 것 방지

function showScreen(name) {
  var next = document.getElementById('screen-' + name);
  var current = document.querySelector('.screen.active');
  if (!next || next === current || isSwitching) return;

  isSwitching = true;

  // 1) 지금 화면을 투명하게
  if (current) current.classList.remove('visible');

  setTimeout(function () {
    // 2) 지금 화면 숨기고 다음 화면 보이기
    if (current) current.classList.remove('active');
    next.classList.add('active');

    // 3) 다음 화면을 서서히 나타나게
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        next.classList.add('visible');
        isSwitching = false;
      });
    });
  }, current ? 400 : 0);
}


// ===== Start Order 버튼 =====
async function goStep(n) {
  console.log('Step', n);
  if (n !== 1) return;

  var session = await getSession();
  if (session) {
    // 이미 로그인 상태 → 로그인 화면 건너뛰기
    await routeAfterLogin();
  } else {
    resetAuthForms();
    switchTab('signin');
    showScreen('auth');
  }
}


// ===== 로그인 후 이동 규칙 =====
// avatar 가 null 이면 (첫 로그인) → 아바타 꾸미기 화면
// avatar 가 있으면 → 매장 화면
async function routeAfterLogin() {
  try {
    var profile = await getProfile();
    if (!profile || profile.avatar === null) {
      showScreen('avatar');
    } else {
      showScreen('shop');
    }
  } catch (err) {
    console.error(err);
    switchTab('signin');
    showScreen('auth');
    showAuthMessage('signin-error', 'Could not load your profile. ' + err.message);
  }
}


// ===== 탭 전환 (Sign In / Create Account) =====
function switchTab(tab) {
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-signin').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  clearAuthMessages();
}


// ===== 메시지 표시 =====
// type: 'error' (빨간 글씨) 또는 'info' (골드 글씨)
function showAuthMessage(id, text, type) {
  var el = document.getElementById(id);
  el.textContent = text;
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
function setLoading(button, loading, label) {
  button.disabled = loading;
  button.textContent = loading ? '...' : label;
}


// ===== 입력값 검사 =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Supabase 에러 메시지를 알아보기 쉬운 문장으로 바꾸기
function friendlyError(err) {
  var msg = (err && err.message) || 'Something went wrong.';
  if (msg.indexOf('Invalid login credentials') !== -1) return 'Email or password is incorrect.';
  if (msg.indexOf('Email not confirmed') !== -1) return 'Please confirm your email first. Check your inbox.';
  if (msg.indexOf('already registered') !== -1) return 'This email is already registered.';
  if (msg.indexOf('Failed to fetch') !== -1) return 'Network error. Please check your connection.';
  return msg;
}


// ===== Sign In 버튼 (Enter) =====
async function handleSignIn(event) {
  event.preventDefault(); // 페이지 새로고침 막기
  clearAuthMessages();

  var email = document.getElementById('signin-email').value.trim();
  var password = document.getElementById('signin-password').value;
  var button = document.getElementById('signin-btn');

  if (!isValidEmail(email)) return showAuthMessage('signin-error', 'Please enter a valid email address.');
  if (password.length < 6) return showAuthMessage('signin-error', 'Password must be at least 6 characters.');

  setLoading(button, true, 'Enter');
  try {
    await signIn(email, password);
    await routeAfterLogin();
  } catch (err) {
    showAuthMessage('signin-error', friendlyError(err));
  } finally {
    setLoading(button, false, 'Enter');
  }
}


// ===== Create Account 버튼 (Create) =====
async function handleSignUp(event) {
  event.preventDefault();
  clearAuthMessages();

  var nickname = document.getElementById('signup-nickname').value.trim();
  var email = document.getElementById('signup-email').value.trim();
  var password = document.getElementById('signup-password').value;
  var password2 = document.getElementById('signup-password2').value;
  var button = document.getElementById('signup-btn');

  if (!nickname) return showAuthMessage('signup-error', 'Please enter a nickname.');
  if (!isValidEmail(email)) return showAuthMessage('signup-error', 'Please enter a valid email address.');
  if (password.length < 6) return showAuthMessage('signup-error', 'Password must be at least 6 characters.');
  if (password !== password2) return showAuthMessage('signup-error', 'Passwords do not match.');

  setLoading(button, true, 'Create');
  try {
    var data = await signUp(email, password, nickname);

    if (data.session) {
      // 이메일 인증 없이 바로 로그인된 경우 → 첫 로그인이니 아바타 화면으로
      await routeAfterLogin();
    } else {
      // 이메일 인증이 필요한 경우 → Sign In 탭으로 보내고 안내
      switchTab('signin');
      document.getElementById('signin-email').value = email;
      showAuthMessage('signin-error', 'Account created! Check your email to confirm, then sign in.', 'info');
    }
  } catch (err) {
    showAuthMessage('signup-error', friendlyError(err));
  } finally {
    setLoading(button, false, 'Create');
  }
}


// ===== Sign Out 버튼 =====
async function handleSignOut() {
  try {
    await signOut();
  } catch (err) {
    console.error(err);
  }
  showScreen('landing');
}


// ===== 페이지 처음 열릴 때 =====
showScreen('landing');
