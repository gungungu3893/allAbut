// ===== 로그인 세션 시간 제한 =====
// 계정 종류에 따라 두 가지 방식이에요 (auth.js 의 isStaffSessionMode() 로 구분):
//
// ① 고객 계정 — "1시간 + 연장" (예전 그대로)
//   - 로그인/회원가입에 성공하면 "만료 시각"을 localStorage 에 저장 (같은 브라우저의 모든 탭이 같은 만료 시각을 공유)
//   - 1초마다 남은 시간을 확인해서 화면에 표시, 5분 남으면 경고 [1시간 연장], 0초가 되면 자동 로그아웃
//   - 연장은 한 번에 1시간, 남은 시간은 최대 3시간까지
//   - 로그아웃돼도 작성 중인 주문(draft)은 지우지 않아요 → 다시 로그인하면 이어서 할 수 있어요
//
// ② 직원 계정 (admin_me() 로 역할이 있는 계정 — owner · manager · staff · sales) — "자리 비움 30분"
//   - 마우스 · 키보드 · 터치 입력이 30분 동안 없으면 로그아웃 (5분 전 경고 + [계속 사용])
//   - 입력이 있을 때마다 만료 시각 = 지금 + 30분 (10초에 한 번만 저장)
//   - 만료 시각은 sessionStorage 에 (로그인 토큰과 같이 — 브라우저 창을 닫으면 사라져요 = 로그아웃)
//   - 1분마다 권한(admin_me)을 다시 확인 → 대표가 [정지] 하면 그 화면도 바로 정지 안내로 (cnc/cnc-team.js cncRecheckStaffAccess)
//   - 로그아웃되면 화면에 남은 고객 정보를 지우고 바로 로그인 화면 (뒤로 가기로도 안 보여요)

var SESSION_KEY = 'allabut_session_expires';
var SESSION_LENGTH = 60 * 60 * 1000;       // 고객: 1시간 (밀리초)
var SESSION_MAX_LEFT = 3 * 60 * 60 * 1000;  // 고객: 최대로 쌓을 수 있는 남은 시간 3시간
var SESSION_WARN_AT = 5 * 60 * 1000;       // 5분 남으면 경고 팝업 (고객 · 직원 공통)
var SESSION_ORANGE_AT = 10 * 60 * 1000;    // 10분 이하: 주황색
var STAFF_IDLE_LENGTH = 30 * 60 * 1000;    // 직원: 입력이 없으면 30분 뒤 로그아웃
var STAFF_IDLE_SAVE_EVERY = 10 * 1000;     // 직원: 입력이 있어도 만료 시각은 10초에 한 번만 저장
var STAFF_ACCESS_CHECK_EVERY = 60 * 1000;  // 직원: 1분마다 권한 다시 확인 (정지 · 역할 변경)
var STAFF_ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel', 'pointerdown'];

var sessionTimer = null;    // 1초마다 도는 타이머
var sessionWarned = false;  // 이번 "5분 구간"에서 경고 팝업을 이미 띄웠는지
var sessionEnding = false;  // endSession 이 실행 중인지 (중복 실행 방지)
var idleListening = false;  // 직원 입력 감지를 켰는지
var idleLastSave = 0;       // 직원 만료 시각을 마지막으로 저장한 때
var accessLastCheck = 0;    // 직원 권한을 마지막으로 확인한 때


// ===== 지금 어떤 방식인지 =====
function isIdleSessionMode() {
  return typeof isStaffSessionMode === 'function' && isStaffSessionMode();
}
// 만료 시각을 두는 곳: 직원 = sessionStorage (창을 닫으면 사라짐) / 고객 = localStorage
function sessionStore() {
  return isIdleSessionMode() ? window.sessionStorage : window.localStorage;
}


// ===== 만료 시각 읽기 / 쓰기 =====
function getSessionExpiry() {
  try {
    var value = sessionStore().getItem(SESSION_KEY);
    var time = value ? parseInt(value, 10) : NaN;
    return isNaN(time) ? null : time;
  } catch (e) {
    return null;
  }
}

function setSessionExpiry(time) {
  try { sessionStore().setItem(SESSION_KEY, String(time)); } catch (e) { /* 저장 불가 */ }
}

function clearSessionExpiry() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}


// ===== 세션 시작 =====
// 고객: 만료 시각 = 지금 + 60분 / 직원: 지금 + 30분 (입력이 있을 때마다 다시 30분)
function startSession() {
  setSessionExpiry(Date.now() + (isIdleSessionMode() ? STAFF_IDLE_LENGTH : SESSION_LENGTH));
  sessionWarned = false;
  if (isIdleSessionMode()) startIdleWatch();
  startSessionTimer();
}

// 직원 계정으로 확인됐을 때 (app.js enterApp — 로그인 직후 · 새로고침):
//   로그인 토큰을 sessionStorage 로 옮기고(auth.js) 만료 시각도 sessionStorage 에 "지금 + 30분" 으로
function switchToStaffSession() {
  var wasIdle = isIdleSessionMode();
  if (typeof useStaffSessionStorage === 'function') useStaffSessionStorage();
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
  if (!wasIdle || getSessionExpiry() === null) setSessionExpiry(Date.now() + STAFF_IDLE_LENGTH);
  sessionWarned = false;
  hideSessionModal();
  startIdleWatch();
  startSessionTimer();
  updateSessionDisplays();
}


// ===== 고객: 세션 연장 (만료 시각 = 현재 만료 시각 + 60분, 남은 시간은 최대 3시간까지) =====
// 실제로 늘어났으면 true, 이미 최대라 그대로면 false
function extendSession() {
  if (isIdleSessionMode()) { touchIdleSession(true); return true; }   // 직원은 "계속 사용" = 다시 30분
  var now = Date.now();
  var current = getSessionExpiry();
  if (current === null) return false;

  var next = Math.max(current, now) + SESSION_LENGTH;
  if (next - now > SESSION_MAX_LEFT) next = now + SESSION_MAX_LEFT;
  if (next - current < 60 * 1000) return false; // 이미 최대(3시간)라 거의 늘어나지 않음

  setSessionExpiry(next);
  if (next - now > SESSION_WARN_AT) {
    sessionWarned = false;  // 다시 5분 남으면 또 경고가 뜨도록
    hideSessionModal();
  }
  updateSessionDisplays();
  return true;
}


// ===== 직원: 입력 감지 → 만료 시각 = 지금 + 30분 =====
function onStaffActivity() {
  if (!sessionTimer || !isIdleSessionMode()) return;
  if (sessionWarned) return;   // 경고 창이 떠 있으면 [계속 사용] 버튼으로만 (지나가는 마우스 움직임으로 닫히지 않게)
  touchIdleSession(false);
}

// force: [계속 사용] 버튼 — 10초 제한 없이 바로 저장 + 경고 닫기
function touchIdleSession(force) {
  var now = Date.now();
  if (!force && now - idleLastSave < STAFF_IDLE_SAVE_EVERY) return;
  idleLastSave = now;
  setSessionExpiry(now + STAFF_IDLE_LENGTH);
  if (force) {
    sessionWarned = false;
    hideSessionModal();
    updateSessionDisplays();
  }
}

function startIdleWatch() {
  if (idleListening) return;
  idleListening = true;
  idleLastSave = Date.now();
  STAFF_ACTIVITY_EVENTS.forEach(function (ev) {
    window.addEventListener(ev, onStaffActivity, { passive: true, capture: true });
  });
}

function stopIdleWatch() {
  if (!idleListening) return;
  idleListening = false;
  STAFF_ACTIVITY_EVENTS.forEach(function (ev) {
    window.removeEventListener(ev, onStaffActivity, { capture: true });
  });
}


// ===== 남은 시간 (밀리초) =====
function getRemaining() {
  var expiry = getSessionExpiry();
  if (expiry === null) return 0;
  return Math.max(0, expiry - Date.now());
}


// ===== 세션 끝내기 =====
// reason:
//   'expired' → 시간 만료 (고객) / 자리 비움 (직원): 안내 문구와 함께
//   'manual'  → Sign Out 버튼
//   'remote'  → 다른 탭에서 로그아웃함 (고객)
//   'invalid' → 화면 이동 없이 로그아웃만 (페이지 열 때 만료 시각이 없는 경우 등)
//   'global'  → 내 정보의 "모든 기기에서 로그아웃" (Supabase signOut scope 'global')
// 화면: 고객 = 랜딩 / 직원 = 바로 로그인 화면. 둘 다 앱 화면에 남은 내용(고객 정보)을 지우고, 주소의 # 도 지워요 (뒤로 가기로 다시 그려지지 않게)
async function endSession(reason) {
  if (sessionEnding) return;
  sessionEnding = true;
  var wasStaff = isIdleSessionMode() || !!(window.APP && APP.adminRole);

  clearSessionExpiry();
  stopSessionTimer();
  stopIdleWatch();
  hideSessionModal();
  sessionWarned = false;

  // 작성 중인 주문은 저장해 두고 앱 화면 정리 + 화면에 남은 내용 지우기 (app.js)
  if (typeof onSessionEnded === 'function') onSessionEnded();

  try {
    await signOut(reason === 'global' ? 'global' : undefined);
  } catch (err) {
    console.error(err);
    if (reason === 'global') { try { await signOut(); } catch (e) { /* 무시 */ } }   // 전체 로그아웃이 안 되면 이 기기만이라도
  }
  if (typeof clearStaffSessionMode === 'function') clearStaffSessionMode();

  // 지금 주소(#/admin/orders 등)를 히스토리에서 지워요 → 로그아웃 뒤 뒤로 가기를 눌러도 앱 화면이 다시 그려지지 않아요 (router.js 는 로그인 전이면 공개 화면만)
  if (reason !== 'invalid') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 무시 */ }
  }

  if (reason !== 'invalid') {
    if (wasStaff && typeof showSignInScreen === 'function') showSignInScreen();
    else showScreen('landing');
  }
  if (reason === 'expired') {
    if (wasStaff && typeof showAuthMessage === 'function') showAuthMessage('signin-error', t('session_idle_signed_out'));
    else showLandingNotice(t('session_expired'));
  }
  if (reason === 'global') {
    if (wasStaff && typeof showAuthMessage === 'function') showAuthMessage('signin-error', t('signout_all_done'));
    else showLandingNotice(t('signout_all_done'));
  }

  sessionEnding = false;
}


// ===== 1초 타이머 (로그인 상태일 때만) =====
function startSessionTimer() {
  if (sessionTimer) return;
  sessionTimer = setInterval(sessionTick, 1000);
  sessionTick();
}

function stopSessionTimer() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = null;
  updateSessionDisplays();
}

function sessionTick() {
  // 다른 탭에서 로그아웃해서 만료 시각이 사라진 경우
  if (getSessionExpiry() === null) {
    endSession('remote');
    return;
  }

  var left = getRemaining();
  updateSessionDisplays();

  if (left <= 0) {
    endSession('expired');
    return;
  }

  if (left <= SESSION_WARN_AT) {
    if (!sessionWarned) {
      sessionWarned = true;
      showSessionModal();   // 5분 남으면 한 번만 자동으로 뜸
    }
  } else {
    sessionWarned = false;  // 연장해서 5분보다 많아지면 다음에 또 뜰 수 있게
    hideSessionModal();     // (다른 탭에서 연장한 경우도 닫힘)
  }

  // 직원: 1분마다 권한 다시 확인 (대표가 정지 · 역할을 바꾸면 이 화면도 바로 — cnc/cnc-team.js)
  if (isIdleSessionMode() && Date.now() - accessLastCheck >= STAFF_ACCESS_CHECK_EVERY) {
    accessLastCheck = Date.now();
    if (typeof cncRecheckStaffAccess === 'function') cncRecheckStaffAccess();
  }
}


// ===== 페이지를 열 때 확인 =====
// Supabase 로그인이 남아 있어도, 만료 시각이 없거나 지났으면 로그아웃
//   직원은 로그인 토큰 · 만료 시각이 sessionStorage 에 있어서, 창을 닫았다 열면 둘 다 없음 → 로그인 화면
// 세션이 유지되면 true, 아니면 false 를 돌려줘요
async function checkSessionOnLoad() {
  var session = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error(err);
    return false;
  }

  if (!session) {
    clearSessionExpiry();
    if (typeof clearStaffSessionMode === 'function') clearStaffSessionMode();
    return false;
  }

  var expiry = getSessionExpiry();
  if (expiry === null) {
    await endSession('invalid');          // 기록이 없음 → 조용히 로그아웃
    return false;
  } else if (expiry <= Date.now()) {
    await endSession('expired');          // 시간이 지남 → 안내와 함께 로그아웃
    return false;
  }
  if (isIdleSessionMode()) startIdleWatch();
  startSessionTimer();                    // 아직 남음 → 세션 유지
  return true;
}


// ===== 다른 탭에서 만료 시각이 바뀌었을 때 (고객 — localStorage 를 같이 쓰는 탭들) =====
window.addEventListener('storage', function (e) {
  if (e.key !== SESSION_KEY || isIdleSessionMode()) return;
  if (e.newValue === null) {
    // 다른 탭에서 로그아웃 또는 만료
    if (sessionTimer) endSession('remote');
  } else if (sessionTimer) {
    // 다른 탭에서 연장
    sessionTick();
  }
});

// 뒤로 가기 캐시(bfcache)로 페이지가 다시 보일 때: 바로 시간 확인 (만료됐으면 그 자리에서 로그아웃)
window.addEventListener('pageshow', function (e) {
  if (e.persisted && sessionTimer) sessionTick();
});
// 다른 창 · 앱에 있다가 돌아왔을 때도 바로 확인 (잠자기에서 깨어난 경우 등)
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && sessionTimer) sessionTick();
});


// ===== 남은 시간을 "52:13" 형식으로 =====
function formatRemaining(ms) {
  var total = Math.ceil(ms / 1000);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var mm = (m < 10 ? '0' : '') + m;
  var ss = (s < 10 ? '0' : '') + s;
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}


// ===== 남은 시간 표시 갱신 =====
// (class="session-badge" 인 곳이 모두 함께 바뀌어요 — 헤더, 메뉴)
//   직원은 "+1h" 버튼이 없어요 (입력이 있으면 저절로 30분)
function updateSessionDisplays() {
  var left = getRemaining();
  var text = formatRemaining(left);
  var level = left <= SESSION_WARN_AT ? 'danger' : (left <= SESSION_ORANGE_AT ? 'warn' : '');
  var idle = isIdleSessionMode();

  var badges = document.querySelectorAll('.session-badge');
  for (var i = 0; i < badges.length; i++) {
    var time = badges[i].querySelector('.session-time');
    if (time) {
      time.textContent = text;
      time.className = 'session-time mono' + (level ? ' ' + level : '');
    }
    var ext = badges[i].querySelector('.session-extend');
    if (ext) ext.hidden = idle;
    badges[i].title = t(idle ? 'session_idle_left' : 'session_time_left');
  }

  var countdown = document.getElementById('session-modal-countdown');
  if (countdown) countdown.textContent = text;
}


// ===== "+1h" 버튼 (고객) =====
function handleExtendClick(button) {
  var extended = extendSession();
  button.textContent = extended ? t('session_extended') : t('session_max');
  button.disabled = true;
  setTimeout(function () {
    button.textContent = '+1h';
    button.disabled = false;
  }, 1500);
}


// ===== 5분 경고 팝업 =====
// 고객: "곧 로그아웃돼요" + [1시간 연장] / 직원: "자리를 비우셨나요?" + [계속 사용]
function showSessionModal() {
  var modal = document.getElementById('session-modal');
  if (!modal) return;
  var idle = isIdleSessionMode();
  var title = document.getElementById('session-modal-title');
  var text = modal.querySelector('.session-modal-text');
  var btn = document.getElementById('session-modal-extend');
  if (title) title.textContent = t(idle ? 'session_idle_title' : 'session_ending_title');
  if (text) text.textContent = t(idle ? 'session_idle_text' : 'session_ending_text');
  if (btn) btn.textContent = t(idle ? 'session_keep_using' : 'session_extend_btn');
  updateSessionDisplays();
  modal.classList.add('open');
  if (btn) { try { btn.focus(); } catch (e) { /* 무시 */ } }
}

function hideSessionModal() {
  var modal = document.getElementById('session-modal');
  if (modal) modal.classList.remove('open');
}

// 팝업의 [1시간 연장] (고객) · [계속 사용] (직원) 버튼
function handleModalExtend() {
  extendSession();
  hideSessionModal();
}


// ===== 랜딩 화면 안내 문구 (3초간 표시) =====
var landingNoticeTimer = null;
function showLandingNotice(text) {
  var el = document.getElementById('landing-notice');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (landingNoticeTimer) clearTimeout(landingNoticeTimer);
  landingNoticeTimer = setTimeout(function () {
    el.classList.remove('show');
  }, 3000);
}
