// ===== 공통 레이아웃 + 공통 부품 =====
// - 헤더 (로고, 메뉴, 크레딧, 세션 타이머, 언어, 글자 크기, 로그아웃)
// - 모바일 하단 고정 탭 4개
// - 공통 부품: escHtml, 토스트, 모달, 확인창, 에러 글씨, 상태 배지, 진행 막대

// ================================================================
// 1) 안전하게 글자 넣기 (XSS 방지) — 사용자가 입력한 값은 항상 이걸 거쳐서 HTML 에 넣어요
// ================================================================
function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ================================================================
// 2) 글자 크기 (100% / 115% / 130%) — 브라우저에 기억
// ================================================================
var FONT_SCALES = [
  { id: 'base', label: 'A', percent: 100 },
  { id: 'large', label: 'A+', percent: 115 },
  { id: 'xlarge', label: 'A++', percent: 130 }
];
var FONT_KEY = 'allabut_font_scale';

function getFontScale() {
  var saved = null;
  try { saved = localStorage.getItem(FONT_KEY); } catch (e) { /* 무시 */ }
  for (var i = 0; i < FONT_SCALES.length; i++) {
    if (FONT_SCALES[i].id === saved) return saved;
  }
  return 'base';
}

function applyFontScale() {
  var id = getFontScale();
  var scale = FONT_SCALES.filter(function (s) { return s.id === id; })[0] || FONT_SCALES[0];
  document.documentElement.style.fontSize = scale.percent + '%';
  var btns = document.querySelectorAll('[data-font]');
  for (var i = 0; i < btns.length; i++) {
    var on = btns[i].getAttribute('data-font') === id;
    btns[i].classList.toggle('active', on);
    btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function setFontScale(id) {
  try { localStorage.setItem(FONT_KEY, id); } catch (e) { /* 무시 */ }
  applyFontScale();
}


// ================================================================
// 3) 로고 (밝은 배경용: all/but 네이비, A·5μm 골드)
// ================================================================
function logoHtml() {
  return '<span class="logo logo-light" aria-label="allAbut 5μm">' +
    '<span class="logo-all">all</span><span class="logo-a">A</span><span class="logo-but">but</span><span class="logo-um">5μm</span>' +
    '</span>';
}


// ================================================================
// 4) 헤더 + 하단 탭
// ================================================================
var NAV_ITEMS = [
  { route: 'home', icon: '🏠', key: 'nav_home' },
  { route: 'new', icon: '➕', key: 'nav_new' },
  { route: 'orders', icon: '📋', key: 'nav_orders' },
  { route: 'profile', icon: '👤', key: 'nav_profile' }
];

function sessionBadgeHtml() {
  return '<div class="session-badge" title="' + escHtml(t('session_time_left')) + '">' +
    '<span aria-hidden="true">⏱</span>' +
    '<span class="session-time">--:--</span>' +
    '<button type="button" class="session-extend" onclick="handleExtendClick(this)">+1h</button>' +
    '</div>';
}

function langSelectHtml(id) {
  return '<label class="lang-select" for="' + id + '">' +
    '<span aria-hidden="true">🌐</span>' +
    '<span class="sr-only">' + escHtml(t('language')) + '</span>' +
    '<select id="' + id + '" onchange="setLang(this.value); saveLangToProfile(this.value)">' +
    LANGUAGES.map(function (l) {
      return '<option value="' + l.code + '"' + (l.code === currentLang ? ' selected' : '') + '>' + escHtml(l.name) + '</option>';
    }).join('') +
    '</select></label>';
}

function fontButtonsHtml() {
  return '<div class="font-buttons" role="group" aria-label="' + escHtml(t('font_size')) + '">' +
    FONT_SCALES.map(function (s) {
      return '<button type="button" class="font-btn" data-font="' + s.id + '" onclick="setFontScale(\'' + s.id + '\')">' + s.label + '</button>';
    }).join('') +
    '</div>';
}

function creditBadgeHtml() {
  var bal = (window.APP && APP.balance != null) ? formatNumber(APP.balance) : '—';
  return '<a href="#/profile" class="credit-badge" title="' + escHtml(t('credit_balance')) + '">' +
    '<span aria-hidden="true">💳</span> <span class="credit-value mono">' + bal + '</span>' +
    '<span class="credit-unit">' + escHtml(t('credit_unit')) + '</span></a>';
}

// 헤더와 하단 탭 그리기 (언어를 바꾸면 다시 그려요)
function renderLayout() {
  var header = document.getElementById('app-header');
  var tabbar = document.getElementById('app-tabbar');
  if (!header || !tabbar) return;

  header.innerHTML =
    '<div class="hdr-inner">' +
      '<a href="#/home" class="hdr-logo">' + logoHtml() + '</a>' +
      '<nav class="hdr-nav" aria-label="Main">' +
        NAV_ITEMS.map(function (n) {
          return '<a href="#/' + n.route + '" class="hdr-link" data-nav="' + n.route + '">' + escHtml(t(n.key)) + '</a>';
        }).join('') +
      '</nav>' +
      '<div class="hdr-right">' +
        creditBadgeHtml() +
        '<div class="hdr-wide">' +
          sessionBadgeHtml() +
          langSelectHtml('hdr-lang') +
          fontButtonsHtml() +
          '<button type="button" class="btn btn-outline btn-sm" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
        '</div>' +
        '<button type="button" class="btn btn-outline btn-sm hdr-menu-btn" aria-expanded="false" aria-controls="hdr-menu" onclick="toggleHeaderMenu()">' +
          '<span aria-hidden="true">☰</span> ' + escHtml(t('menu')) +
        '</button>' +
      '</div>' +
    '</div>' +
    // 펼치는 메뉴 (모바일·좁은 화면)
    '<div class="hdr-menu" id="hdr-menu" hidden>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('session_time_left')) + '</span>' + sessionBadgeHtml() + '</div>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('language')) + '</span>' + langSelectHtml('menu-lang') + '</div>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('font_size')) + '</span>' + fontButtonsHtml() + '</div>' +
      '<button type="button" class="btn btn-outline btn-block" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
    '</div>';

  tabbar.innerHTML = NAV_ITEMS.map(function (n) {
    return '<a href="#/' + n.route + '" class="tab-link" data-nav="' + n.route + '">' +
      '<span class="tab-icon" aria-hidden="true">' + n.icon + '</span>' +
      '<span class="tab-label">' + escHtml(t(n.key)) + '</span></a>';
  }).join('');

  applyFontScale();
  if (typeof updateSessionDisplays === 'function') updateSessionDisplays();
  if (window.currentRoute) setActiveNav(window.currentRoute);
}

// 지금 페이지 메뉴 강조
function setActiveNav(route) {
  var links = document.querySelectorAll('[data-nav]');
  for (var i = 0; i < links.length; i++) {
    var on = links[i].getAttribute('data-nav') === route;
    links[i].classList.toggle('active', on);
    if (on) links[i].setAttribute('aria-current', 'page');
    else links[i].removeAttribute('aria-current');
  }
  closeHeaderMenu();
}

function toggleHeaderMenu() {
  var menu = document.getElementById('hdr-menu');
  var btn = document.querySelector('.hdr-menu-btn');
  if (!menu) return;
  var open = menu.hidden;
  menu.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeHeaderMenu() {
  var menu = document.getElementById('hdr-menu');
  var btn = document.querySelector('.hdr-menu-btn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// 메뉴 바깥을 누르면 닫기
document.addEventListener('click', function (e) {
  var menu = document.getElementById('hdr-menu');
  if (!menu || menu.hidden) return;
  if (e.target.closest('#hdr-menu') || e.target.closest('.hdr-menu-btn')) return;
  closeHeaderMenu();
});


// ================================================================
// 5) 크레딧 잔액 (헤더 배지 + 화면들에 알림)
// ================================================================
function updateCreditBadges() {
  var els = document.querySelectorAll('.credit-value');
  var text = (window.APP && APP.balance != null) ? formatNumber(APP.balance) : '—';
  for (var i = 0; i < els.length; i++) els[i].textContent = text;
}

async function refreshBalance() {
  try {
    APP.balance = await cncGetBalance();
  } catch (err) {
    console.error('Balance load failed:', err);
  }
  updateCreditBadges();
  window.dispatchEvent(new CustomEvent('balancechange'));
  return APP.balance;
}

function setBalance(value) {
  APP.balance = value;
  updateCreditBadges();
  window.dispatchEvent(new CustomEvent('balancechange'));
}

// 언어를 바꾸면 내 프로필에도 저장 (실패해도 화면은 그대로)
function saveLangToProfile(code) {
  if (!window.APP || !APP.user) return;
  cncSaveProfile({ lang: code }).catch(function (err) { console.warn('Language save failed:', err); });
}


// ================================================================
// 6) 토스트 (화면 아래 잠깐 뜨는 안내)
// ================================================================
function uiToast(message, type) {
  var root = document.getElementById('toast-root');
  if (!root) return;
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  var icon = type === 'error' ? '⚠' : (type === 'success' ? '✓' : 'ℹ');
  el.innerHTML = '<span class="toast-icon" aria-hidden="true">' + icon + '</span><span>' + escHtml(message) + '</span>';
  root.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('show'); });
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 300);
  }, type === 'error' ? 5000 : 3000);
}


// ================================================================
// 7) 모달 (가운데 뜨는 창)
// ================================================================
// uiModal({ title, body: 'HTML', actions: [{ label, kind: 'primary'|'outline'|'danger'|'gold', onClick(close) }], onClose, wide })
// 돌려주는 값: { el, close }
function uiModal(opts) {
  var root = document.getElementById('modal-root');
  var lastFocus = document.activeElement;
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-box' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title-' + root.children.length + '">' +
      '<div class="modal-head">' +
        '<h2 class="modal-title" id="modal-title-' + root.children.length + '">' + escHtml(opts.title || '') + '</h2>' +
        '<button type="button" class="btn btn-outline btn-sm" data-modal-close><span aria-hidden="true">✕</span> ' + escHtml(t('btn_close')) + '</button>' +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.actions && opts.actions.length ? '<div class="modal-actions"></div>' : '') +
    '</div>';
  root.appendChild(overlay);

  var closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(function () { overlay.remove(); }, 200);
    if (opts.onClose) opts.onClose();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* 무시 */ } }
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  if (opts.actions) {
    var bar = overlay.querySelector('.modal-actions');
    opts.actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-' + (a.kind || 'outline');
      b.textContent = a.label;
      b.addEventListener('click', function () { a.onClick ? a.onClick(close, b) : close(); });
      bar.appendChild(b);
    });
  }
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.closest('[data-modal-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(function () {
    overlay.classList.add('open');
    var first = overlay.querySelector('input, select, textarea') || overlay.querySelector('.modal-actions .btn') || overlay.querySelector('[data-modal-close]');
    if (first) first.focus();
  });
  return { el: overlay, close: close };
}

// 확인창: await uiConfirm({ title, message, okLabel, cancelLabel, danger }) → true / false
function uiConfirm(opts) {
  return new Promise(function (resolve) {
    var answered = false;
    uiModal({
      title: opts.title,
      body: '<p class="modal-text">' + escHtml(opts.message || '') + '</p>',
      actions: [
        { label: opts.cancelLabel || t('btn_cancel'), kind: 'outline', onClick: function (close) { answered = true; resolve(false); close(); } },
        { label: opts.okLabel || t('btn_ok'), kind: opts.danger ? 'danger' : 'primary', onClick: function (close) { answered = true; resolve(true); close(); } }
      ],
      onClose: function () { if (!answered) resolve(false); }
    });
  });
}


// ================================================================
// 8) 작은 부품들
// ================================================================

// 칸 바로 아래 빨간 에러 글씨 (key 가 없으면 빈 글자)
function uiFieldError(key, params) {
  if (!key) return '';
  return '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(tf(key, params)) + '</p>';
}

// 상태 배지
function uiStageBadge(stage) {
  return '<span class="badge stage-' + escHtml(stage) + '">' + escHtml(t('stage_' + stage)) + '</span>';
}

// 가로 진행 막대 ①~⑦
function uiStageBar(stage) {
  var idx = stageIndex(stage);
  var cancelled = stage === 'cancelled';
  return '<ol class="stagebar' + (cancelled ? ' cancelled' : '') + '" aria-label="' + escHtml(t('order_progress')) + '">' +
    ORDER_STAGES.map(function (s, i) {
      var state = cancelled ? '' : (i < idx ? 'done' : (i === idx ? 'current' : ''));
      return '<li class="stagebar-step ' + state + '" title="' + escHtml(t('stage_' + s.key)) + '">' +
        '<span class="stagebar-dot mono">' + (state === 'done' ? '✓' : (i + 1)) + '</span>' +
        '<span class="stagebar-label">' + escHtml(t('stage_' + s.key)) + '</span>' +
        '</li>';
    }).join('') +
    '</ol>';
}

// 쉐이드 색 칩
function uiShadeChip(shade) {
  if (!shade) return '<span class="shade-chip empty" aria-hidden="true"></span>';
  return '<span class="shade-chip" style="background:' + (VITA_BG[shade] || '#eee') + '" aria-hidden="true"></span>';
}

// 로딩 표시
function uiLoading() {
  return '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> ' + escHtml(t('loading')) + '</div>';
}

// 파일 아이콘
function uiFileIcon(name) {
  var kind = fileKind(name);
  if (kind === '3d') return '🧊';
  if (kind === 'image') return '🖼';
  if (kind === 'pdf') return '📄';
  return '📎';
}

// 서버 에러 코드 → 번역된 문장
function uiErrorMessage(err) {
  var code = cncErrorCode(err);
  var map = {
    INSUFFICIENT_CREDITS: 'insufficient_credits_msg',
    NO_TEETH: 'err_no_teeth',
    DELIVERY_REQUIRED: 'err_delivery_required',
    NOT_LOGGED_IN: 'err_not_logged_in',
    NOT_EDITABLE: 'err_not_editable',
    NOT_CANCELLABLE: 'err_not_cancellable',
    NOT_FOUND: 'err_not_found',
    NOTE_REQUIRED: 'design_reject_required',
    INVALID_ACTION: 'err_invalid_action',
    UPLOAD_FAILED: 'err_upload_failed',
    NETWORK: 'err_network'
  };
  if (code === 'UPLOAD_FAILED' && err && err.fileName) return tf('err_upload_failed_file', { name: err.fileName });
  return t(map[code] || 'err_unknown');
}
