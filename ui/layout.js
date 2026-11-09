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
  if (typeof fitHeader === 'function') fitHeader();
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
  { route: 'guide', icon: '📖', key: 'nav_guide', showIcon: true },
  { route: 'new', icon: '➕', key: 'nav_new' },
  { route: 'orders', icon: '📋', key: 'nav_orders' },
  { route: 'profile', icon: '👤', key: 'nav_profile' }
];
// 관리자에게만 보이는 메뉴
var ADMIN_NAV_ITEM = { route: 'admin', icon: '🛠', key: 'nav_admin', admin: true };

// Admin 배지 옆 역할 (Owner / Manager / Staff)
function adminRoleTagHtml() {
  var role = window.APP && APP.adminRole;
  return role ? ' <span class="admin-role-tag">' + escHtml(t('role_' + role)) + '</span>' : '';
}

// 푸터 문의 줄: "문의: support@… · LINE @925caqxb" (값은 company_settings, 비면 숨김)
function footerContactHtml() {
  if (typeof cncContactInfo !== 'function') return '';
  var c = cncContactInfo();
  var parts = [];
  if (c.email) parts.push('<a href="' + escHtml(cncMailto(c.email)) + '" class="footer-email">' + escHtml(c.email) + '</a>');
  parts.push('<a href="' + escHtml(c.lineUrl) + '" target="_blank" rel="noopener" class="footer-line">LINE ' + escHtml(c.lineId) + '</a>');
  return '<p class="footer-contact"><a href="#/contact" class="footer-contact-label">' + escHtml(t('footer_contact')) + '</a>: ' +
    parts.join(' <span aria-hidden="true">·</span> ') + '</p>';
}

// 에러 메시지 아래 "문제가 계속되면 문의하기" 링크
function uiContactHelpHtml() {
  return '<p class="help-contact"><a href="#/contact"><span aria-hidden="true">💁</span> ' + escHtml(t('help_contact_link')) + '</a></p>';
}

// 지금 사용자에게 보여줄 메뉴 목록
function navItems() {
  return (window.APP && APP.isAdmin) ? NAV_ITEMS.concat([ADMIN_NAV_ITEM]) : NAV_ITEMS;
}

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

// 크레딧 배지 (곧 만료되는 크레딧이 있으면 작은 주황 점) + "Top up" 버튼
function creditBadgeHtml() {
  var bal = (window.APP && APP.balance != null) ? formatNumber(APP.balance) : '—';
  var soon = (window.APP && APP.expiringSoon) || 0;
  return '<a href="#/profile" class="credit-badge" title="' + escHtml(soon ? tf('credit_expiring_soon', { n: soon }) : t('credit_balance')) + '">' +
    '<span aria-hidden="true">💳</span> <span class="credit-value mono">' + bal + '</span>' +
    '<span class="credit-unit">' + escHtml(t('credit_unit')) + '</span>' +
    '<span class="expiry-dot"' + (soon ? '' : ' hidden') + '><span class="sr-only">' + escHtml(tf('credit_expiring_soon', { n: soon })) + '</span></span>' +
    '</a>' +
    '<a href="#/topup" class="btn btn-gold btn-sm topup-btn" data-nav="topup">' + escHtml(t('topup_btn')) + '</a>';
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
        navItems().map(function (n) {
          return '<a href="#/' + n.route + '" class="hdr-link' + (n.admin ? ' hdr-link-admin' : '') + '" data-nav="' + n.route + '">' +
            (n.admin ? '<span class="admin-badge">' + escHtml(t(n.key)) + adminRoleTagHtml() + '</span>'
              : (n.showIcon ? '<span aria-hidden="true">' + n.icon + '</span>&nbsp;' : '') + escHtml(t(n.key))) + '</a>';
        }).join('') +
      '</nav>' +
      '<div class="hdr-right">' +
        '<span class="hdr-line-slot">' + lineHeaderHtml() + '</span>' +
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
      '<a href="#/topup" class="btn btn-gold btn-block hdr-menu-topup">💳 ' + escHtml(t('topup_btn')) + '</a>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('session_time_left')) + '</span>' + sessionBadgeHtml() + '</div>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('language')) + '</span>' + langSelectHtml('menu-lang') + '</div>' +
      '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('font_size')) + '</span>' + fontButtonsHtml() + '</div>' +
      '<a href="#/about" class="btn btn-outline btn-block hdr-menu-about"><span aria-hidden="true">🏢</span> ' + escHtml(t('about_nav')) + '</a>' +
      '<a href="#/contact" class="btn btn-outline btn-block hdr-menu-contact"><span aria-hidden="true">💁</span> ' + escHtml(t('contact_title')) + '</a>' +
      '<button type="button" class="btn btn-outline btn-block" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
    '</div>';

  var items = navItems();
  tabbar.style.gridTemplateColumns = 'repeat(' + items.length + ', 1fr)';
  tabbar.innerHTML = items.map(function (n) {
    return '<a href="#/' + n.route + '" class="tab-link" data-nav="' + n.route + '">' +
      '<span class="tab-icon" aria-hidden="true">' + n.icon + '</span>' +
      '<span class="tab-label">' + escHtml(t(n.key)) + '</span></a>';
  }).join('');

  applyFontScale();
  if (typeof updateSessionDisplays === 'function') updateSessionDisplays();
  if (window.currentRoute) setActiveNav(window.currentRoute);
  fitHeader();
  requestAnimationFrame(fitHeader);   // 화면이 보인 직후 한 번 더 (로그인 직후엔 아직 안 보일 수 있어요)
}

// 헤더가 한 줄에 안 들어가면 단계적으로 줄여요 (언어·글자 크기·관리자 메뉴·화면 폭에 따라 자동)
//   fit-1: LINE 버튼 글자를 "LINE" 으로
//   fit-2: 오른쪽 전체(타이머·언어·글자 크기·로그아웃)를 ☰ 메뉴로
//   fit-3: Top up 버튼을 ☰ 메뉴로
//   fit-4: 위쪽 메뉴 간격 좁게
//   fit-5: 로고 조금 작게
//   fit-6: (PC) 위쪽 메뉴 대신 아래 탭 메뉴, 로고의 작은 5μm 숨김
var HEADER_FIT_LEVELS = 6;
function fitHeader() {
  var header = document.getElementById('app-header');
  if (!header) return;
  var inner = header.querySelector('.hdr-inner');
  if (!inner || !inner.offsetParent) return;          // 화면에 안 보이면 (로그인 전) 건너뛰기
  for (var i = 1; i <= HEADER_FIT_LEVELS; i++) header.classList.remove('fit-' + i);
  document.body.classList.remove('hdr-tabbar');
  for (var lv = 1; lv <= HEADER_FIT_LEVELS; lv++) {
    if (inner.scrollWidth <= inner.clientWidth) break;
    header.classList.add('fit-' + lv);
  }
  document.body.classList.toggle('hdr-tabbar', header.classList.contains('fit-6'));
}
var _fitTimer = null;
window.addEventListener('resize', function () {
  clearTimeout(_fitTimer);
  _fitTimer = setTimeout(fitHeader, 80);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitHeader(); });
// 헤더가 처음 화면에 보일 때·폭이 바뀔 때마다 다시 맞추기 (로그인 직후엔 아직 숨겨져 있어서 위의 호출이 건너뛰어질 수 있어요)
if (window.ResizeObserver) {
  (function () {
    var lastW = -1;
    var ro = new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      fitHeader();
    });
    function watch() {
      var h = document.getElementById('app-header');
      if (h) ro.observe(h);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
  })();
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
  var soon = (window.APP && APP.expiringSoon) || 0;
  var dots = document.querySelectorAll('.expiry-dot');
  for (var j = 0; j < dots.length; j++) {
    dots[j].hidden = !soon;
    var sr = dots[j].querySelector('.sr-only');
    if (sr) sr.textContent = tf('credit_expiring_soon', { n: soon });
    var badge = dots[j].closest('.credit-badge');
    if (badge) badge.title = soon ? tf('credit_expiring_soon', { n: soon }) : t('credit_balance');
  }
  fitHeader();   // 숫자가 길어지면 헤더 폭이 바뀌어요
}

async function refreshBalance() {
  try {
    var res = await Promise.all([cncGetBalance(), cncGetMyLots().catch(function () { return null; })]);
    APP.balance = res[0];
    if (res[1]) {
      APP.lots = res[1];
      APP.expiringSoon = cncExpiringSoon(res[1]);
    }
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
  // Escape 는 맨 위에 떠 있는 창만 닫아요 (창 위에 창이 열린 경우)
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.viewer-overlay.open')) return;   // 파일 뷰어가 먼저 닫혀요
    var open = root.querySelectorAll('.modal-overlay.open');   // 닫히는 중인 창은 빼고
    if (open[open.length - 1] === overlay) close();
  }

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

// 단계 색 (상태 배지 · 관리자 단계 카드 · 진행 줄 공통)
// 이 표 하나만 고치면 홈 · 내 주문 · 관리자 화면 색이 같이 바뀌어요
//   fg: 배지 글자, bg: 배지 바탕, accent: 카드 왼쪽 선 · 강조
var STAGE_COLORS = {
  submitted:       { fg: '#1F3A68', bg: '#EEF2F7', accent: '#1F3A68' },
  confirmed:       { fg: '#1E3A8A', bg: '#E0EAFF', accent: '#3B5BDB' },
  design_ready:    { fg: '#7A4F01', bg: '#FFF1C2', accent: '#E0A800' },
  design_revision: { fg: '#9A3412', bg: '#FFE4D5', accent: '#E8590C' },
  approved:        { fg: '#166534', bg: '#DCFCE7', accent: '#2F9E44' },
  milling:         { fg: '#075985', bg: '#E0F2FE', accent: '#1C7ED6' },
  shipped:         { fg: '#5B21B6', bg: '#EDE9FE', accent: '#7048E8' },
  done:            { fg: '#065F46', bg: '#D1FAE5', accent: '#0CA678' },
  cancelled:       { fg: '#475467', bg: '#F2F4F7', accent: '#98A2B3' }
};

// style="..." 에 넣을 단계 색 변수 (--stage-fg, --stage-bg, --stage-accent)
function uiStageStyle(stage) {
  var c = STAGE_COLORS[stage] || STAGE_COLORS.submitted;
  return '--stage-fg:' + c.fg + ';--stage-bg:' + c.bg + ';--stage-accent:' + c.accent;
}

// 상태 배지 (모든 화면 공통)
function uiStageBadge(stage) {
  return '<span class="badge stage-badge stage-' + escHtml(stage) + '" style="' + uiStageStyle(stage) + '">' + escHtml(t('stage_' + stage)) + '</span>';
}

// 얇은 진행 줄 (7칸, 지난 칸·지금 칸 골드) + "현재: 디자인 검토 (3/7)" — 내 주문 카드용
function uiStageProgress(stage) {
  if (stage === 'cancelled') return '';
  var idx = stageIndex(stage);
  var total = ORDER_STAGES.length;
  return '<span class="stage-progress" role="img" aria-label="' + escHtml(tf('stage_now_fmt', { stage: t('stage_' + stage), n: idx + 1, total: total })) + '">' +
    '<span class="stage-progress-bar" aria-hidden="true">' + ORDER_STAGES.map(function (s, i) {
      return '<span class="stage-progress-cell' + (i <= idx ? ' on' : '') + (i === idx ? ' current' : '') + '"></span>';
    }).join('') + '</span>' +
    '<span class="stage-progress-text" aria-hidden="true">' + escHtml(tf('stage_now_fmt', { stage: t('stage_' + stage), n: idx + 1, total: total })) + '</span>' +
    '</span>';
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
    CANNOT_CANCEL_AFTER_MILLING: 'err_cannot_cancel_after_milling',
    NOT_FOUND: 'err_not_found',
    NOTE_REQUIRED: 'design_reject_required',
    INVALID_ACTION: 'err_invalid_action',
    UPLOAD_FAILED: 'err_upload_failed',
    NETWORK: 'err_network',
    NOT_ADMIN: 'admin_err_not_admin',
    STAGE_CHANGED: 'admin_err_stage_changed',
    NO_FILES: 'admin_err_no_files',
    FILE_TOO_LARGE: 'admin_err_file_too_large',
    INVALID_AMOUNT: 'admin_err_amount',
    BALANCE_NEGATIVE: 'admin_err_balance_negative',
    PACKAGE_NOT_FOUND: 'topup_err_package',
    SLIP_INVALID: 'topup_slip_required',
    SLIP_NOT_FOUND: 'err_upload_failed',
    TOO_MANY_PENDING: 'topup_err_too_many',
    ALREADY_REVIEWED: 'admin_err_already_reviewed',
    AMOUNT_TOO_HIGH: 'admin_err_amount_too_high',
    LOT_NOT_REFUNDABLE: 'admin_err_lot_not_refundable',
    NO_LOTS: 'admin_err_no_lots',
    VERSION_OUTDATED: 'consent_outdated',
    DUPLICATE_VERSION: 'admin_err_duplicate_version',
    USER_NOT_FOUND: 'team_err_user_not_found',
    ALREADY_MEMBER: 'team_err_already_member',
    INVALID_ROLE: 'team_err_invalid_role',
    NOT_MEMBER: 'team_err_not_member',
    LAST_OWNER: 'team_err_last_owner',
    CANNOT_REMOVE_SELF: 'team_err_remove_self'
  };
  if (code === 'UPLOAD_FAILED' && err && err.fileName) return tf('err_upload_failed_file', { name: err.fileName });
  if (code === 'FILE_TOO_LARGE' && err && err.fileName) return tf('file_reject_size', { name: err.fileName, size: 50 });
  return t(map[code] || 'err_unknown');
}


// ================================================================
// 9) 디자인 버전 목록 · 처리 이력 (고객 화면·관리자 화면 공통)
// ================================================================

// versions: cncOrderDesigns(order) 결과
// viewCall(vi, fi): 👁 버튼 onclick 에 넣을 자바스크립트 글자 (예: "PageOrders.viewDesign('CA..', 0, 1)")
function uiDesignVersions(versions, viewCall) {
  if (!versions.length) return '<p class="muted">' + escHtml(t('no_design_files')) + '</p>';
  var last = versions.length - 1;
  // 최신 버전이 맨 위
  return '<ol class="design-versions">' + versions.map(function (v, vi) {
    return { v: v, vi: vi };
  }).reverse().map(function (item) {
    var v = item.v;
    var latest = item.vi === last;
    return '<li class="design-version' + (latest ? ' latest' : '') + '">' +
      '<div class="design-version-head">' +
        '<span class="design-version-tag mono">v' + escHtml(v.version) + '</span>' +
        (latest ? '<span class="badge stage-design_ready">' + escHtml(t('design_latest')) + '</span>' : '') +
        '<span class="muted">' + escHtml(v.date ? formatDateTime(v.date) : '') + '</span>' +
      '</div>' +
      '<ul class="file-list">' + v.files.map(function (f, fi) {
        return '<li class="file-row">' +
          '<span class="file-icon" aria-hidden="true">' + uiFileIcon(f.name) + '</span>' +
          '<span class="file-info"><span class="file-name">' + escHtml(f.name) + '</span></span>' +
          '<span class="file-actions"><button type="button" class="btn btn-outline btn-sm" onclick="' + escHtml(viewCall(item.vi, fi)) + '">' +
            '<span aria-hidden="true">👁</span> ' + escHtml(t('btn_preview')) + '</button></span>' +
          '</li>';
      }).join('') + '</ul>' +
      '</li>';
  }).join('') + '</ol>';
}

// 처리 이력 타임라인 (review_history)
// showNames: 관리자 화면에서만 true → 처리한 직원 이름(by_name)을 보여줘요 (고객 화면은 "관리자")
function uiHistoryList(history, showNames) {
  history = history || [];
  if (!history.length) return '<p class="muted">' + escHtml(t('history_empty')) + '</p>';
  return '<ol class="timeline">' + history.slice().reverse().map(function (h) {
    h = h || {};
    var action = h.action || 'note';
    var label = t('review_' + action);
    if (label === 'review_' + action) label = action;   // 모르는 동작이면 그대로
    var who = h.by === 'admin' ? (showNames && h.by_name ? h.by_name : t('by_admin')) : t('by_customer');
    return '<li class="timeline-item action-' + escHtml(action) + '">' +
      '<span class="timeline-dot" aria-hidden="true"></span>' +
      '<div class="timeline-body">' +
        '<p class="timeline-head"><b>' + escHtml(label) + '</b> <span class="muted">· ' + escHtml(who) + ' · ' + escHtml(formatDateTime(h.date)) + '</span></p>' +
        (h.note ? '<p class="pre timeline-note">' + escHtml(h.note) + '</p>' : '') +
      '</div></li>';
  }).join('') + '</ol>';
}



// ================================================================
// 10) 작은 팝오버 (버튼 아래 말풍선) — 새 주문 단계의 "? Help"
// ================================================================
var _popover = null;

function closePopover() {
  if (!_popover) return;
  var p = _popover;
  _popover = null;
  p.el.remove();
  p.btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('mousedown', p.outside);
  document.removeEventListener('keydown', p.key);
}

function uiPopover(btn, html) {
  if (_popover && _popover.btn === btn) { closePopover(); return; }
  closePopover();
  var el = document.createElement('div');
  el.className = 'popover';
  el.setAttribute('role', 'dialog');
  el.innerHTML = '<div class="popover-body">' + html + '</div>' +
    '<button type="button" class="btn btn-outline btn-sm popover-close">' + escHtml(t('btn_close')) + '</button>';
  document.body.appendChild(el);
  var r = btn.getBoundingClientRect();
  var w = Math.min(380, window.innerWidth - 32);
  el.style.width = w + 'px';
  var left = document.documentElement.dir === 'rtl' ? r.left : r.right - w;
  left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
  el.style.left = left + 'px';
  el.style.top = (r.bottom + window.scrollY + 8) + 'px';
  btn.setAttribute('aria-expanded', 'true');

  var p = {
    el: el,
    btn: btn,
    outside: function (e) { if (!el.contains(e.target) && !btn.contains(e.target)) closePopover(); },
    key: function (e) { if (e.key === 'Escape') { closePopover(); btn.focus(); } }
  };
  el.querySelector('.popover-close').addEventListener('click', function () { closePopover(); btn.focus(); });
  el.addEventListener('click', function (e) { if (e.target.closest('a')) closePopover(); });
  _popover = p;
  setTimeout(function () { document.addEventListener('mousedown', p.outside); }, 0);
  document.addEventListener('keydown', p.key);
  el.querySelector('.popover-close').focus({ preventScroll: true });
}
window.addEventListener('hashchange', closePopover);


// ================================================================
// 11) 충전 요청 상태 배지
// ================================================================
function uiTopupBadge(status) {
  return '<span class="badge topup-' + escHtml(status) + '">' + escHtml(t('topup_status_' + status)) + '</span>';
}


// ================================================================
// 12) 하단 푸터 (모든 화면): About · Terms · Privacy · Credit & Refund Policy · © 2026 회사명
// ================================================================
function renderFooters() {
  var c = (typeof _companyCache !== 'undefined' && _companyCache) || {};
  var name = c.company_name || 'allAbut';
  var html = footerContactHtml() +
    '<nav class="footer-links" aria-label="' + escHtml(t('legal_documents')) + '">' +
    ['<a href="#/about" class="footer-about">' + escHtml(t('about_nav')) + '</a>'].concat(LEGAL_DOCS_LIST.map(function (d) {
      return '<a href="#/' + d.route + '">' + escHtml(t(d.titleKey)) + '</a>';
    })).join('<span aria-hidden="true">·</span>') +
    '</nav><p class="footer-copy">© 2026 ' + escHtml(name) + '</p>';
  var els = document.querySelectorAll('.site-footer');
  for (var i = 0; i < els.length; i++) els[i].innerHTML = html;
}


// ================================================================
// 13) 약관·개인정보 재동의 창 (전체 화면, 닫기 없음)
// ================================================================
// 동의하기 전에는 주문·충전 등 앱을 쓸 수 없어요. 법적 문서 페이지와 Sign Out 은 가능해요.
function updateConsentGate() {
  var need = !!(window.APP && APP.user && APP.needsConsent);
  var onLegal = window.currentRoute && (typeof isPublicRoute === 'function' ? isPublicRoute(window.currentRoute) : isLegalRoute(window.currentRoute));
  if (need && !onLegal) showConsentGate();
  else hideConsentGate();
}

function showConsentGate() {
  var gate = document.getElementById('consent-gate');
  if (!gate) return;
  var v = (APP.legal) || {};
  var first = !(APP.profile && APP.profile.accepted_at);
  gate.innerHTML =
    '<div class="consent-box" role="dialog" aria-modal="true" aria-labelledby="consent-title">' +
      '<h2 class="consent-title" id="consent-title">' + escHtml(t(first ? 'consent_title_first' : 'consent_title')) + '</h2>' +
      '<p class="consent-text">' + escHtml(t(first ? 'consent_text_first' : 'consent_text')) + '</p>' +
      '<ul class="consent-links">' +
        '<li><a href="#/terms" target="_blank" rel="noopener">' + escHtml(t('legal_terms')) + '</a> <span class="muted mono">' + escHtml(v.terms ? v.terms.version : '') + '</span></li>' +
        '<li><a href="#/privacy" target="_blank" rel="noopener">' + escHtml(t('legal_privacy')) + '</a> <span class="muted mono">' + escHtml(v.privacy ? v.privacy.version : '') + '</span></li>' +
      '</ul>' +
      '<p class="consent-note">' + escHtml(t('consent_note')) + '</p>' +
      '<div class="consent-actions">' +
        '<button type="button" class="btn btn-primary btn-lg" id="consent-agree" onclick="agreeToLegal(this)">' + escHtml(t('consent_agree')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-lg" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
      '</div>' +
    '</div>';
  gate.hidden = false;
  document.body.classList.add('consent-open');
  var btn = document.getElementById('consent-agree');
  if (btn) btn.focus();
}

function hideConsentGate() {
  var gate = document.getElementById('consent-gate');
  if (!gate) return;
  gate.hidden = true;
  gate.innerHTML = '';
  document.body.classList.remove('consent-open');
}

async function agreeToLegal(btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  try {
    await cncAcceptLegal(APP.legal);
    APP.needsConsent = false;
    hideConsentGate();
    uiToast(t('consent_thanks'), 'success');
  } catch (err) {
    console.error(err);
    if (cncErrorCode(err) === 'VERSION_OUTDATED') {
      // 그 사이 새 버전이 나왔으면 다시 읽어서 보여줘요
      try { APP.legal = await cncGetLegalVersions(true); } catch (e) { /* 무시 */ }
      showConsentGate();
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = t('consent_agree');
    }
    uiToast(uiErrorMessage(err), 'error');
  }
}
