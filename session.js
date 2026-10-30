// ===== 로그인 세션 시간 제한 (1시간) + 연장 =====
// - 로그인/회원가입에 성공하면 "만료 시각"을 브라우저(localStorage)에 저장해요.
// - localStorage 는 같은 브라우저의 모든 탭이 함께 쓰기 때문에, 여러 탭에서 열어도 같은 만료 시각을 공유해요.
// - 1초마다 남은 시간을 확인해서 화면에 표시하고, 5분 남으면 경고, 0초가 되면 자동 로그아웃해요.

var SESSION_KEY = 'allabut_session_expires';
var SESSION_LENGTH = 60 * 60 * 1000;      // 1시간 (밀리초)
var SESSION_MAX_LEFT = 3 * 60 * 60 * 1000; // 최대로 쌓을 수 있는 남은 시간: 3시간
var SESSION_WARN_AT = 5 * 60 * 1000;      // 5분 남으면 경고 팝업
var SESSION_ORANGE_AT = 10 * 60 * 1000;   // 10분 이하: 주황색

var sessionTimer = null;    // 1초마다 도는 타이머
var sessionWarned = false;  // 이번 "5분 구간"에서 경고 팝업을 이미 띄웠는지
var sessionEnding = false;  // endSession 이 실행 중인지 (중복 실행 방지)


// ===== 만료 시각 읽기 / 쓰기 =====
function getSessionExpiry() {
  try {
    var value = localStorage.getItem(SESSION_KEY);
    var time = value ? parseInt(value, 10) : NaN;
    return isNaN(time) ? null : time;
  } catch (e) {
    return null;
  }
}

function setSessionExpiry(time) {
  try { localStorage.setItem(SESSION_KEY, String(time)); } catch (e) { /* 저장 불가 */ }
}

function clearSessionExpiry() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}


// ===== 세션 시작: 만료 시각 = 지금 + 60분 =====
function startSession() {
  setSessionExpiry(Date.now() + SESSION_LENGTH);
  sessionWarned = false;
  startSessionTimer();
}


// ===== 세션 연장: 만료 시각 = 현재 만료 시각 + 60분 (남은 시간은 최대 3시간까지) =====
// 실제로 늘어났으면 true, 이미 최대라 그대로면 false
function extendSession() {
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


// ===== 남은 시간 (밀리초) =====
function getRemaining() {
  var expiry = getSessionExpiry();
  if (expiry === null) return 0;
  return Math.max(0, expiry - Date.now());
}


// ===== 세션 끝내기 =====
// reason:
//   'expired' → 시간 만료: 랜딩으로 + "Session expired" 안내 3초
//   'manual'  → Sign Out 버튼: 랜딩으로
//   'remote'  → 다른 탭에서 로그아웃함: 랜딩으로
//   'invalid' → 화면 이동 없이 로그아웃만 (페이지 열 때 만료 시각이 없는 경우 등)
async function endSession(reason) {
  if (sessionEnding) return;
  sessionEnding = true;

  clearSessionExpiry();
  stopSessionTimer();
  hideSessionModal();
  sessionWarned = false;

  try {
    await signOut();
  } catch (err) {
    console.error(err);
  }

  if (reason !== 'invalid') {
    showScreen('landing');
  }
  if (reason === 'expired') {
    showLandingNotice('Session expired. Please sign in again.');
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
}


// ===== 페이지를 열 때 확인 =====
// Supabase 로그인이 남아 있어도, 만료 시각이 없거나 지났으면 로그아웃
async function checkSessionOnLoad() {
  var session = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error(err);
    return;
  }

  if (!session) {
    clearSessionExpiry();
    return;
  }

  var expiry = getSessionExpiry();
  if (expiry === null) {
    await endSession('invalid');          // 기록이 없음 → 조용히 로그아웃
  } else if (expiry <= Date.now()) {
    await endSession('expired');          // 시간이 지남 → 안내와 함께 로그아웃
  } else {
    startSessionTimer();                  // 아직 남음 → 세션 유지
  }
}


// ===== 다른 탭에서 만료 시각이 바뀌었을 때 =====
window.addEventListener('storage', function (e) {
  if (e.key !== SESSION_KEY) return;
  if (e.newValue === null) {
    // 다른 탭에서 로그아웃 또는 만료
    if (sessionTimer) endSession('remote');
  } else {
    // 다른 탭에서 로그인 또는 연장
    startSessionTimer();
    sessionTick();
  }
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


// ===== 화면 오른쪽 위 남은 시간 표시 갱신 =====
// (class="session-badge" 인 곳이 모두 함께 바뀌어요)
function updateSessionDisplays() {
  var left = getRemaining();
  var text = formatRemaining(left);
  var level = left <= SESSION_WARN_AT ? 'danger' : (left <= SESSION_ORANGE_AT ? 'warn' : '');

  var badges = document.querySelectorAll('.session-badge');
  for (var i = 0; i < badges.length; i++) {
    var time = badges[i].querySelector('.session-time');
    time.textContent = text;
    time.className = 'session-time' + (level ? ' ' + level : '');
  }

  var countdown = document.getElementById('session-modal-countdown');
  if (countdown) countdown.textContent = text;
}


// ===== "+1h" 버튼 =====
function handleExtendClick(button) {
  var extended = extendSession();
  button.textContent = extended ? '+1h ✓' : 'Max 3h';
  button.disabled = true;
  setTimeout(function () {
    button.textContent = '+1h';
    button.disabled = false;
  }, 1500);
}


// ===== 5분 경고 팝업 =====
function showSessionModal() {
  var modal = document.getElementById('session-modal');
  if (!modal) return;
  updateSessionDisplays();
  modal.classList.add('open');
}

function hideSessionModal() {
  var modal = document.getElementById('session-modal');
  if (modal) modal.classList.remove('open');
}

// 팝업의 "Extend 1 hour" 버튼
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
