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
// noTab: 모바일 하단 탭에는 넣지 않아요 (자리가 부족해서 → ☰ 메뉴 맨 위에 대신 있어요)
var NAV_ITEMS = [
  { route: 'home', icon: '🏠', key: 'nav_home' },
  { route: 'about', icon: '🏢', key: 'about_nav', noTab: true },   // 회사소개 (홈 바로 오른쪽)
  { route: 'guide', icon: '📖', key: 'nav_guide', showIcon: true },
  { route: 'new', icon: '➕', key: 'nav_new' },
  { route: 'orders', icon: '📋', key: 'nav_orders' },
  { route: 'profile', icon: '👤', key: 'nav_profile' }
];
// 관리자에게만 보이는 메뉴
var ADMIN_NAV_ITEM = { route: 'admin', icon: '🛠', key: 'nav_admin', admin: true };
// 영업 담당(관리 팀이 아닌 sales 역할)에게 Admin 대신 보이는 메뉴 하나 → #/admin/sales (sql/015)
var SALES_NAV_ITEM = { route: 'admin', href: 'admin/sales', icon: '💼', key: 'nav_sales', admin: true, sales: true };

// ----------------------------------------------------------------
// 직원 계정(sql/023)의 메뉴 — "Admin" 대신 역할에 맞는 메뉴가 위쪽 메뉴 줄(휴대폰은 하단 탭 + ☰)에 바로
//   nav = data-nav 값 ('admin:탭' — PageAdmin 이 지금 탭을 강조),
//   more = 휴대폰 하단 탭에는 없고 관리 화면 맨 위 작은 줄에 (PageAdmin.drawFrame — ☰ 메뉴는 내 정보 · 언어 · 글자 크기 · 로그아웃만)
//   영업 = [내 실적] [내 거래처] [내 정보] / 제작 직원 = [주문] [내 작업] [내 정보] (sql/024 — 활동 기록은 owner · manager 만)
// ----------------------------------------------------------------
var STAFF_NAV = {
  sales: [
    { tab: 'sales', icon: '📊', key: 'snav_perf' },
    { tab: 'sclients', icon: '🏥', key: 'snav_clients' }
  ],
  staff: [
    { tab: 'orders', icon: '📋', key: 'admin_tab_orders' },
    { tab: 'mywork', icon: '✅', key: 'snav_mywork' }
  ],
  manager: [
    { tab: 'orders', icon: '📋', key: 'admin_tab_orders' },
    { tab: 'topups', icon: '💳', key: 'admin_tab_topups' },
    { tab: 'customers', icon: '👥', key: 'admin_tab_customers' },
    { tab: 'dashboard', icon: '📊', key: 'admin_tab_dashboard' },
    { tab: 'tax', icon: '🧾', key: 'admin_tab_tax', more: true },
    { tab: 'activity', icon: '📝', key: 'admin_tab_activity', more: true },
    { tab: 'settings', icon: '📢', key: 'snav_ads', more: true }
  ]
};
function staffNavItems() {
  var A = window.APP || {};
  var role = A.adminRole;
  if (!role || (A.adminStatus && A.adminStatus !== 'active')) {
    return [{ route: 'profile', icon: '👤', key: 'nav_profile' }];
  }
  var list = (STAFF_NAV[role] || STAFF_NAV.staff).slice();
  if (role !== 'sales' && A.isSalesRep) list.push({ tab: 'sales', icon: '💼', key: 'nav_sales', more: true });   // 영업 담당도 겸하면
  var items = list.map(function (n) {
    return { route: 'admin', href: 'admin/' + n.tab, nav: 'admin:' + n.tab, icon: n.icon, key: n.key, more: !!n.more, noTab: !!n.more, staff: true };
  });
  items.push({ route: 'profile', icon: '👤', key: 'nav_profile', more: items.length >= 4, noTab: items.length >= 4, staff: true });
  return items;
}

// 직원 계정의 역할 배지 (로고 옆) — 역할 이름 그대로: "영업" / "제작" / "매니저" / "대표" (+ " · 확인 대기")
function staffRoleBadgeHtml() {
  var A = window.APP || {};
  if (!cncIsStaffAccount()) return '';
  var text = A.adminRole ? t('badge_role_' + A.adminRole) : t('staff_account');
  if (A.adminStatus && A.adminStatus !== 'active') text += ' · ' + t(cncMemberStatusKey(A.adminStatus));
  return '<span class="staff-role-badge">' + escHtml(text) + '</span>';
}

// 메뉴 주소 (#/ 뒤)
function navHref(n) {
  return n.href || n.route;
}
// 메뉴 강조용 이름 (data-nav)
function navKey(n) {
  return n.nav || n.route;
}

// Admin 배지 옆 역할 (Owner / Manager / Staff) — 영업 메뉴에는 안 붙여요 (글자가 겹쳐서)
function adminRoleTagHtml() {
  var role = window.APP && APP.adminRole;
  if (!role || (window.APP && !APP.isAdmin)) return '';
  return ' <span class="admin-role-tag">' + escHtml(t('role_' + role)) + '</span>';
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
  if (typeof cncIsStaffAccount === 'function' && cncIsStaffAccount()) return staffNavItems();   // 직원 계정 (sql/023)
  if (window.APP && APP.isAdmin) return NAV_ITEMS.concat([ADMIN_NAV_ITEM]);
  if (window.APP && APP.isSalesRep) return NAV_ITEMS.concat([SALES_NAV_ITEM]);
  return NAV_ITEMS;
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

// 크라운 세트 잔액을 보여줄지: 세트 크레딧이 있거나, 판매 중인 세트 패키지가 있을 때 (sql/018)
function cncShowCrownSet() {
  var A = window.APP || {};
  return !!(A.crownSet && Number(A.crownSet.total) > 0) || A.crownSetOnSale === true;
}

// 크레딧 배지 (곧 만료되는 크레딧이 있으면 작은 주황 점) + "Top up" 버튼
//   크라운 세트를 보여줄 때는 "🔩 12 · 👑 3" (어버트먼트 · 세트), 아니면 예전처럼 "💳 12 크레딧"
function creditBadgeHtml() {
  var bal = (window.APP && APP.balance != null) ? formatNumber(APP.balance) : '—';
  var soon = (window.APP && APP.expiringSoon) || 0;
  var crown = cncShowCrownSet();
  var crownBal = (window.APP && APP.crownSet) ? formatNumber(APP.crownSet.total || 0) : '0';
  return '<a href="#/profile" class="credit-badge' + (crown ? ' two-products' : '') + '" title="' + escHtml(soon ? tf('credit_expiring_soon', { n: soon }) : t('credit_balance')) + '">' +
    '<span class="credit-abut"><span aria-hidden="true" class="credit-icon">' + (crown ? '🔩' : '💳') + '</span> <span class="credit-value mono">' + bal + '</span></span>' +
    '<span class="credit-crown"' + (crown ? '' : ' hidden') + '><span class="credit-sep" aria-hidden="true">·</span><span aria-hidden="true">👑</span> ' +
      '<span class="credit-value-crown mono">' + crownBal + '</span><span class="sr-only"> ' + escHtml(t('product_crown_set_short')) + '</span></span>' +
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
  // 직원 계정 (sql/023): 크레딧 · 충전 · LINE 고객 연결은 없고, 로고 옆에 역할 배지 · 로고는 역할 첫 화면으로
  var staffAcc = typeof cncIsStaffAccount === 'function' && cncIsStaffAccount();
  document.body.classList.toggle('staff-account', staffAcc);
  var homeHref = staffAcc ? '#/' + cncStaffStartRoute() : '#/home';

  header.innerHTML =
    '<div class="hdr-inner">' +
      '<a href="' + homeHref + '" class="hdr-logo">' + logoHtml() + '</a>' +
      '<span class="test-badge-slot" hidden></span>' +   // 테스트 서비스면 "TEST" 배지 (ui/service-badge.js)
      (staffAcc ? staffRoleBadgeHtml() : '') +
      '<nav class="hdr-nav" aria-label="Main">' +
        navItems().map(function (n) {
          return '<a href="#/' + navHref(n) + '" class="hdr-link' + (n.admin ? ' hdr-link-admin' : '') + '" data-nav="' + navKey(n) + '">' +
            (n.admin ? '<span class="admin-badge">' + escHtml(t(n.key)) + adminRoleTagHtml() + '</span>'
              : (n.showIcon ? '<span aria-hidden="true">' + n.icon + '</span>&nbsp;' : '') + escHtml(t(n.key))) + '</a>';
        }).join('') +
      '</nav>' +
      '<div class="hdr-right">' +
        (staffAcc ? '' : '<span class="hdr-line-slot">' + lineHeaderHtml() + '</span>' + creditBadgeHtml()) +
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
      // 회사소개: 메뉴 맨 위 첫 번째 (위쪽 메뉴 줄이 보이는 PC 에서는 CSS 로 숨겨요 — 거기엔 이미 있어서)
      (staffAcc
        // 직원: ☰ 메뉴는 [내 정보] [언어] [글자 크기] [로그아웃] 만 (역할 메뉴는 위쪽 메뉴 줄 · 아래 탭 · 관리 화면 맨 위 작은 줄에)
        ? '<a href="#/profile" class="btn btn-outline btn-block hdr-menu-staff" data-nav="profile"><span aria-hidden="true">👤</span> ' + escHtml(t('nav_profile')) + '</a>' +
          '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('language')) + '</span>' + langSelectHtml('menu-lang') + '</div>' +
          '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('font_size')) + '</span>' + fontButtonsHtml() + '</div>'
        : '<a href="#/about" class="btn btn-outline btn-block hdr-menu-about" data-nav="about"><span aria-hidden="true">🏢</span> ' + escHtml(t('about_nav')) + '</a>' +
          '<a href="#/topup" class="btn btn-gold btn-block hdr-menu-topup">💳 ' + escHtml(t('topup_btn')) + '</a>' +
          '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('session_time_left')) + '</span>' + sessionBadgeHtml() + '</div>' +
          '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('language')) + '</span>' + langSelectHtml('menu-lang') + '</div>' +
          '<div class="hdr-menu-row"><span class="hdr-menu-label">' + escHtml(t('font_size')) + '</span>' + fontButtonsHtml() + '</div>' +
          '<a href="#/contact" class="btn btn-outline btn-block hdr-menu-contact"><span aria-hidden="true">💁</span> ' + escHtml(t('contact_title')) + '</a>') +
      '<button type="button" class="btn btn-outline btn-block" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
    '</div>';

  // 모바일 하단 탭: noTab(회사소개)은 기본으로 숨김. PC 에서 위쪽 메뉴 대신 아래 탭을 쓸 때(fit-7)만 CSS 로 보여요
  var items = navItems();
  var shown = items.filter(function (n) { return !n.noTab; });
  tabbar.style.gridTemplateColumns = 'repeat(' + shown.length + ', 1fr)';
  tabbar.innerHTML = items.map(function (n) {
    return '<a href="#/' + navHref(n) + '" class="tab-link' + (n.noTab ? ' tab-pc-only' : '') + '" data-nav="' + navKey(n) + '">' +
      '<span class="tab-icon" aria-hidden="true">' + n.icon + '</span>' +
      '<span class="tab-label">' + escHtml(t(n.key)) + '</span></a>';
  }).join('');

  if (typeof ServiceBadge === 'object') ServiceBadge.render();   // 새로 만든 헤더의 TEST 배지 칸 채우기
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
//   fit-6: 위쪽 메뉴 글자 조금 작게 + 가이드 아이콘·Admin 역할 글자·크레딧 단위 숨김 (회사소개까지 메뉴가 7개라)
//   fit-7: (PC) 위쪽 메뉴 대신 아래 탭 메뉴(이때는 회사소개 탭도 보여요), 로고의 작은 5μm 숨김
//   fit-8: (아주 좁을 때 — 예: 360px · 아랍어 · 글자 130%) 헤더 양옆 여백 · 버튼 사이 간격 · 버튼 안 여백 좁게, 로고 조금 더 작게,
//          LINE 버튼은 글자 "LINE" 만(초록 버튼 그대로), ☰ 메뉴 버튼은 글자만 ("메뉴"), 크레딧 아이콘 작게
//   fit-9: (그래도 안 되면) 크레딧 숫자 · 버튼 글자를 조금 작게 — 글자 라벨은 끝까지 남겨요 (아이콘만 있는 버튼 금지)
var HEADER_FIT_LEVELS = 9;
var HEADER_TABBAR_LEVEL = 7;   // fit-7 부터 위쪽 메뉴 대신 아래 탭
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
  document.body.classList.toggle('hdr-tabbar', header.classList.contains('fit-' + HEADER_TABBAR_LEVEL));
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
  // 크라운 세트 (sql/018): 보여줄 때만 "· 👑 n"
  var crown = cncShowCrownSet();
  var ctext = formatNumber((window.APP && APP.crownSet && APP.crownSet.total) || 0);
  var cw = document.querySelectorAll('.credit-crown');
  for (var c = 0; c < cw.length; c++) {
    cw[c].hidden = !crown;
    var cv = cw[c].querySelector('.credit-value-crown');
    if (cv) cv.textContent = ctext;
    var b = cw[c].closest('.credit-badge');
    if (b) {
      b.classList.toggle('two-products', crown);
      var ic = b.querySelector('.credit-icon');
      if (ic) ic.textContent = crown ? '🔩' : '💳';
    }
  }
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
    var res = await Promise.all([
      cncGetBalance(),
      cncGetMyLots().catch(function () { return null; }),
      cncGetCreditSummary().catch(function () { return null; })   // 무료 / 산 크레딧 (sql/008)
    ]);
    APP.balance = res[0];
    var lots = (res[2] && res[2].lots) || res[1];
    if (lots) {
      APP.lots = lots;
      APP.expiringSoon = cncExpiringSoon(lots);
    }
    APP.creditSummaryOk = !!res[2];   // 요약 함수(sql/008·009)가 있는지 — 없으면 전부 충전으로 보여요
    if (res[2]) {
      // 주문 계산용: freeCredits = 등록 주소 전용 무료 / paidCredits = 어디로든 배송 가능 (산 + 제한 없는 무료)
      APP.freeCredits = res[2].free;
      APP.paidCredits = res[2].paid + res[2].freeOpen;
      // 보여주기용: 산 크레딧 / 무료 크레딧 전체
      APP.purchasedCredits = res[2].paid;
      APP.freeTotal = res[2].free + res[2].freeOpen;
      // 크라운 세트 (sql/018) — 위 값들은 전부 어버트먼트
      var cs = res[2].crownSet || { paid: 0, free: 0, freeOpen: 0, total: 0 };
      APP.crownSet = {
        total: cs.total || (cs.paid + cs.free + cs.freeOpen),
        purchased: cs.paid, freeTotal: cs.free + cs.freeOpen,
        freeCredits: cs.free, paidCredits: cs.paid + cs.freeOpen
      };
      APP.crownSetOnSale = !!res[2].crownSetOnSale;
    } else {
      // 008 실행 전: 전부 산 크레딧으로 봐요
      APP.freeCredits = 0;
      APP.paidCredits = APP.balance || 0;
      APP.purchasedCredits = APP.balance || 0;
      APP.freeTotal = 0;
      APP.crownSet = { total: 0, purchased: 0, freeTotal: 0, freeCredits: 0, paidCredits: 0 };
      APP.crownSetOnSale = false;
    }
  } catch (err) {
    console.error('Balance load failed:', err);
  }
  updateCreditBadges();
  uiRefreshCreditSplits();
  window.dispatchEvent(new CustomEvent('balancechange'));
  return APP.balance;
}

// 주문·취소 등으로 새 잔액만 받았을 때: 전체 잔액은 바로 바꾸고, 충전 / 무료 나눔은 서버 요약으로 다시 읽어요
function setBalance(value) {
  APP.balance = value;
  updateCreditBadges();
  window.dispatchEvent(new CustomEvent('balancechange'));
  refreshBalance();
}


// ================================================================
// 5-1) 잔액 나눠 보기: 💳 충전 n · 🎁 무료 n (헤더는 전체 잔액만 — 여기 안 써요)
// ================================================================
// 값은 이미 있는 것만: APP.purchasedCredits(충전) / APP.freeTotal(무료 = 등록 주소 전용 + 제한 없는 무료)
//   요약 함수가 없으면(sql/008 전) refreshBalance 가 purchasedCredits = 전체, freeTotal = 0 으로 둬요 → 전부 충전
// opts:
//   expiry: true  → 종류마다 가장 빠른 만료일 "~날짜" (APP.lots 에서, 묶음 종류는 cncLotKind)
//   note:   true  → 등록 주소 전용 무료가 있으면 작은 안내 한 줄
//   paid / free / paidExpiry / freeExpiry / restrictedFree → 직접 넘기면 그 값으로 (관리자 고객 상세 등). 이때는 자동 갱신 안 함
//   cls: 추가 클래스
// 직접 값을 넘기지 않은 부품은 잔액이 바뀔 때(refreshBalance) 자동으로 다시 그려져요 (uiRefreshCreditSplits)
// 종류별 지금 값 { balance, purchased, freeTotal, freeCredits(등록 주소 전용), paidCredits(어디로든) } — 'abutment' 는 예전 APP 값 그대로
function cncProductCredits(product) {
  var A = window.APP || {};
  if (cncProductOf(product) === 'crown_set') {
    var c = A.crownSet || {};
    return { balance: Number(c.total || 0), purchased: Number(c.purchased || 0), freeTotal: Number(c.freeTotal || 0),
             freeCredits: Number(c.freeCredits || 0), paidCredits: Number(c.paidCredits || 0), known: A.balance != null };
  }
  return { balance: Number(A.balance || 0), purchased: A.purchasedCredits != null ? Number(A.purchasedCredits) : Number(A.balance || 0),
           freeTotal: Number(A.freeTotal || 0), freeCredits: Number(A.freeCredits || 0),
           paidCredits: A.paidCredits != null ? Number(A.paidCredits) : Number(A.balance || 0), known: A.balance != null };
}

// 상품 이름: long = "🔩 커스텀 어버트먼트" / "👑 어버트먼트 + 지르코니아 크라운 세트", 짧게 = "🔩 어버트먼트" / "👑 크라운 세트"
function uiProductName(product, short) {
  var c = cncProductOf(product) === 'crown_set';
  return (c ? '👑 ' : '🔩 ') + t(c ? (short ? 'product_crown_set_short' : 'product_crown_set') : (short ? 'product_abutment_short' : 'product_abutment'));
}

// 작은 상품 배지 (목록 · 표용)
function uiProductBadge(product, short) {
  var c = cncProductOf(product) === 'crown_set';
  return '<span class="product-badge ' + (c ? 'product-crown' : 'product-abutment') + '">' + escHtml(uiProductName(product, short !== false)) + '</span>';
}

function uiCreditSplitValues(opts) {
  opts = opts || {};
  var v = {};
  if (opts.paid != null || opts.free != null) {
    v.paid = Number(opts.paid || 0);
    v.free = Number(opts.free || 0);
    v.paidExpiry = opts.paidExpiry || null;
    v.freeExpiry = opts.freeExpiry || null;
    v.restrictedFree = Number(opts.restrictedFree || 0);
    return v;
  }
  var A = window.APP || {};
  var product = cncProductOf(opts.product);
  var pc = cncProductCredits(product);
  v.paid = pc.purchased;
  v.free = product === 'crown_set' ? pc.freeTotal : (A.freeTotal != null ? Number(A.freeTotal) : 0);
  v.restrictedFree = pc.freeCredits;
  v.paidExpiry = null;
  v.freeExpiry = null;
  var summary = A.creditSummaryOk !== false && A.freeTotal != null;
  (A.lots || []).forEach(function (l) {
    if (!(Number(l.remaining) > 0) || new Date(l.expires_at) <= new Date()) return;
    if (cncProductOf(l.product) !== product) return;   // 그 종류의 묶음만 (018 전 묶음은 product 가 없어서 어버트먼트)
    var kind = summary ? cncLotKind(l) : 'paid';
    var key = kind === 'free' ? 'freeExpiry' : 'paidExpiry';
    if (!v[key] || new Date(l.expires_at) < new Date(v[key])) v[key] = l.expires_at;
  });
  return v;
}

function uiCreditSplitInner(opts) {
  opts = opts || {};
  var v = uiCreditSplitValues(opts);
  var known = opts.paid != null || opts.free != null || (window.APP && APP.balance != null);
  function item(kind, icon, labelKey, n, exp) {
    return '<span class="cs-item cs-' + kind + '"><span aria-hidden="true">' + icon + '</span> ' +
      '<span class="cs-label">' + escHtml(t(labelKey)) + '</span> ' +
      '<b class="mono cs-num">' + (known ? formatNumber(n) : '—') + '</b>' +
      (opts.expiry && exp && n > 0 ? ' <span class="cs-exp">' + escHtml(tf('split_until', { date: formatDate(exp) })) + '</span>' : '') +
      '</span>';
  }
  return '<span class="credit-split-bar">' +
      item('paid', '💳', 'paid_short', v.paid, v.paidExpiry) +
      '<span class="cs-sep" aria-hidden="true">·</span>' +
      item('free', '🎁', 'free_short', v.free, v.freeExpiry) +
    '</span>' +
    (opts.note && v.restrictedFree > 0 ? '<span class="cs-note">🎁 ' + escHtml(t('split_free_note')) + '</span>' : '');
}

function uiCreditSplitHtml(opts) {
  opts = opts || {};
  var live = opts.paid == null && opts.free == null;
  var flags = (opts.expiry ? 'e' : '') + (opts.note ? 'n' : '') + (cncProductOf(opts.product) === 'crown_set' ? 'c' : '');
  return '<span class="credit-split-wrap' + (opts.cls ? ' ' + opts.cls : '') + '"' +
    (live ? ' data-credit-split="' + flags + '"' : '') + '>' + uiCreditSplitInner(opts) + '</span>';
}

// 화면에 있는 (자동 갱신) 부품을 지금 값으로 다시 그려요
function uiRefreshCreditSplits() {
  var els = document.querySelectorAll('[data-credit-split]');
  for (var i = 0; i < els.length; i++) {
    var f = els[i].getAttribute('data-credit-split') || '';
    els[i].innerHTML = uiCreditSplitInner({ expiry: f.indexOf('e') !== -1, note: f.indexOf('n') !== -1, product: f.indexOf('c') !== -1 ? 'crown_set' : 'abutment' });
  }
  var rows = document.querySelectorAll('[data-product-credits]');
  for (var j = 0; j < rows.length; j++) {
    var g = rows[j].getAttribute('data-product-credits') || '';
    rows[j].innerHTML = uiProductCreditsInner({ expiry: g.indexOf('e') !== -1, note: g.indexOf('n') !== -1, all: g.indexOf('a') !== -1 });
  }
}

// 종류별 잔액 (홈 · 내 정보 · 충전): 줄마다 [상품 이름] [합계] + 💳 충전 n · 🎁 무료 n
//   크라운 세트 줄은 세트 크레딧이 있거나 판매 중일 때만 (opts.all = 항상). 판매 전 + 0 이면 "곧 출시"
//   잔액이 바뀌면 자동으로 다시 그려요 (uiRefreshCreditSplits)
function uiProductCreditsInner(opts) {
  opts = opts || {};
  var A = window.APP || {};
  var known = A.balance != null;
  var list = (opts.all || cncShowCrownSet()) ? CNC_PRODUCTS : ['abutment'];
  return list.map(function (p) {
    var pc = cncProductCredits(p);
    var soon = p === 'crown_set' && !A.crownSetOnSale && !(pc.balance > 0);
    return '<div class="pc-row pc-' + p + '">' +
      '<div class="pc-head"><span class="pc-name">' + escHtml(uiProductName(p)) + '</span>' +
        '<span class="pc-total"><b class="mono">' + (known ? formatNumber(pc.balance) : '—') + '</b> <span class="pc-unit">' + escHtml(t('credit_unit')) + '</span></span></div>' +
      (soon ? '<p class="pc-soon">' + escHtml(t('crown_coming_soon')) + '</p>'
        : '<div class="pc-split">' + uiCreditSplitInner({ expiry: opts.expiry, note: opts.note, product: p }) + '</div>') +
      '</div>';
  }).join('');
}

function uiProductCreditsHtml(opts) {
  opts = opts || {};
  var flags = (opts.expiry ? 'e' : '') + (opts.note ? 'n' : '') + (opts.all ? 'a' : '');
  return '<div class="product-credits' + (opts.cls ? ' ' + opts.cls : '') + '" data-product-credits="' + flags + '">' + uiProductCreditsInner(opts) + '</div>';
}

// 이력 · 묶음 줄의 종류 배지: 💳 충전 / 🎁 무료 (+ 이벤트 이름) / 섞임(주문: 🎁 무료 n · 💳 충전 n)
//   k: { kind: 'paid' | 'free' | 'mixed', event, free, paid } (cncCreditHistoryKinds · cncLotKind)
function uiCreditKindBadge(k) {
  k = k || { kind: 'paid' };
  if (k.kind === 'mixed') {
    return '<span class="kind-badge kind-mixed">🎁 ' + escHtml(t('free_short')) + ' <b class="mono">' + formatNumber(k.free || 0) + '</b>' +
      ' <span aria-hidden="true">·</span> 💳 ' + escHtml(t('paid_short')) + ' <b class="mono">' + formatNumber(k.paid || 0) + '</b></span>';
  }
  if (k.kind === 'free') {
    return '<span class="kind-badge kind-free">🎁 ' + escHtml(t('free_short')) + '</span>' +
      (k.event ? '<span class="kind-event">' + escHtml(k.event) + '</span>' : '');
  }
  return '<span class="kind-badge kind-paid">💳 ' + escHtml(t('paid_short')) + '</span>';
}

// 납기 표시: 있으면 날짜, 없으면(디자인 승인 전) "디자인 승인 때 결정" (sql/012)
//   admin: true → 관리자용 회색 배지 "납기 미정 · 디자인 승인 때 결정"
function uiDeadlineHtml(o, admin) {
  if (o && o.deadline) return '<span class="deadline-date">' + escHtml(formatDate(o.deadline)) + '</span>';
  if (admin) return '<span class="badge deadline-tbd">' + escHtml(t('deadline_tbd_admin')) + '</span>';
  return '<span class="deadline-tbd-text">' + escHtml(t('deadline_tbd')) + '</span>';
}

// 이 주문에 쓴 크레딧: 🎁 무료 n / 💳 충전 n (cnc_orders.bonus_used · credits_used 그대로)
// 주문의 종류별 치아 수 "🔩 어버트먼트 2 · 👑 크라운 세트 1" (크라운 세트가 없으면 빈 글자 — 예전 주문 · 어버트먼트만)
//   counts: cncOrderProductCounts(order) 또는 cncProductCounts(draft)
function uiProductCountsHtml(counts, always) {
  counts = counts || {};
  var a = Number(counts.abutment || 0), c = Number(counts.crown_set || 0);
  if (!c && !always) return '';
  var parts = [];
  if (a || always) parts.push('<span class="pcount pcount-abutment">' + escHtml(uiProductName('abutment', true)) + ' <b class="mono">' + formatNumber(a) + '</b></span>');
  if (c || always) parts.push('<span class="pcount pcount-crown">' + escHtml(uiProductName('crown_set', true)) + ' <b class="mono">' + formatNumber(c) + '</b></span>');
  return '<span class="product-counts">' + parts.join('<span class="pcount-sep" aria-hidden="true"> · </span>') + '</span>';
}

function uiOrderCreditUseHtml(creditsUsed, bonusUsed) {
  var used = Number(creditsUsed || 0), free = Math.min(used, Math.max(0, Number(bonusUsed || 0)));
  return '<span class="order-credit-use"><span class="mono">' + formatNumber(used) + '</span> ' +
    '<span class="ocu-split">(🎁 ' + escHtml(t('free_short')) + ' <b class="mono">' + formatNumber(free) + '</b>' +
    ' <span aria-hidden="true">/</span> 💳 ' + escHtml(t('paid_short')) + ' <b class="mono">' + formatNumber(used - free) + '</b>)</span></span>';
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

// ================================================================
// 전화번호 칸 (공통 부품) — 왼쪽 "[국기] +66 ▾" (회색, 직접 입력 안 됨) + 오른쪽 뒷번호 입력
// ================================================================
// 회원가입 · 필수 정보 입력 · 내 정보 · 등록 정보 변경 요청 · 새 주문 배송 연락처가 모두 이것 하나를 써요.
//   uiPhoneField({ id, value, country, invalid, inputClass, state, onchange })  → HTML
//     onchange = 값이 바뀔 때마다 실행할 자바스크립트 글자 (예: "PageNew.setDeliveryPhone()") — 국가번호를 바꿀 때도
//     value   = 저장된 번호 ('0812345678' / '+821012345678') → cncSplitPhone 으로 두 칸에 나눠 보여줘요
//     country = 치과 국가 — 국가번호는 기본으로 이 나라를 따라가요 (국가 선택이 바뀌면 uiPhoneSetCountry)
//   국가번호 표시를 누르면 숨은 <select> 가 열려 다른 국가번호를 고를 수 있어요 (예: 태국 치과인데 해외 번호)
//     → 그때부터는 국가를 바꿔도 따라가지 않아요 (치과 국가와 같은 번호를 다시 고르면 다시 따라가요)
//   번호를 통째로 붙여넣으면 (+66812345678 · 0066… · 0812345678) 국가번호 · 앞의 0 을 알아서 정리 (cncParsePhoneInput)
//   uiPhoneRaw(id)            → '+66812345678' (검사용 — cncValidateIdentity / cncValidPhone 에 그대로)
//   uiPhoneValue(id, country) → 저장할 값 (cncNormPhone — 태국 치과 + 태국 번호 = 0812345678, 그 밖 = +국가번호…)
//   RTL(ar · fa) 에서도 국가번호가 번호 앞에 오게 칸 전체가 dir="ltr"
function uiPhoneField(opts) {
  opts = opts || {};
  var id = opts.id;
  var clinic = cncNormCountry(opts.country || 'TH');
  var split = cncSplitPhone(opts.value, clinic);
  // opts.state (uiPhoneState 로 읽어 둔 값): 다시 그려도 뒷번호 · 고른 국가번호 · "국가 따라가기" 가 그대로
  if (opts.state) split = { country: opts.state.follow ? clinic : opts.state.dial, rest: opts.state.rest };
  var cur = split.country || clinic;
  var follow = cur === clinic ? '1' : '0';
  var hook = opts.onchange ? '; ' + opts.onchange : '';
  var lang = typeof currentLang !== 'undefined' ? currentLang : 'en';
  var options = cncCountryOptions(cur, lang).map(function (c) {
    return '<option value="' + c.code + '"' + (c.code === cur ? ' selected' : '') + '>' + escHtml(c.label) + '</option>';
  }).join('');
  return '<div class="phone-field' + (opts.invalid ? ' invalid' : '') + '" dir="ltr" id="' + id + '-wrap">' +
      '<span class="phone-dial">' +
        '<span class="phone-dial-show" id="' + id + '-dial-show" aria-hidden="true">' + uiPhoneDialText(cur) + '</span>' +
        '<select class="phone-dial-select" id="' + id + '-dial" aria-label="' + escHtml(t('phone_dial_label')) + '"' +
          ' data-clinic="' + clinic + '" data-follow="' + follow + '" onchange="uiPhoneDialChange(\'' + id + '\')' + escHtml(hook) + '">' + options + '</select>' +
      '</span>' +
      '<input class="' + (opts.inputClass || 'input') + ' phone-rest' + (opts.invalid ? ' invalid' : '') + '" id="' + id + '" type="tel" inputmode="tel" autocomplete="tel-national"' +
        ' maxlength="20" dir="ltr" placeholder="' + escHtml(uiPhonePlaceholder(cur)) + '" value="' + escHtml(split.rest) + '"' +
        ' oninput="uiPhoneInput(\'' + id + '\', false)' + escHtml(hook) + '" onchange="uiPhoneInput(\'' + id + '\', true)' + escHtml(hook) + '"' +
        ' onpaste="setTimeout(function () { uiPhoneInput(\'' + id + '\', true)' + escHtml(hook) + '; }, 0)">' +
    '</div>';
}

function uiPhoneDialText(country) {
  var dial = cncDialCode(country);
  return '<span class="phone-flag">' + cncCountryFlag(country) + '</span> <span class="mono">+' + escHtml(dial) + '</span> <span class="phone-caret">▾</span>';
}

// 입력 칸 예시: 태국 "81 234 5678", 그 밖 "phone number" (지금 언어)
function uiPhonePlaceholder(country) {
  return cncNormCountry(country) === 'TH' ? '81 234 5678' : t('phone_placeholder');
}

// 국가번호 표시 · 예시를 지금 고른 나라로
function _uiPhoneRefresh(id) {
  var sel = document.getElementById(id + '-dial');
  if (!sel) return;
  var show = document.getElementById(id + '-dial-show');
  if (show) show.innerHTML = uiPhoneDialText(sel.value);
  var input = document.getElementById(id);
  if (input) input.placeholder = uiPhonePlaceholder(sel.value);
}

// 사람이 국가번호를 직접 골랐을 때: 치과 국가와 다르면 그때부터는 국가를 따라가지 않아요
function uiPhoneDialChange(id) {
  var sel = document.getElementById(id + '-dial');
  if (!sel) return;
  sel.setAttribute('data-follow', sel.value === sel.getAttribute('data-clinic') ? '1' : '0');
  _uiPhoneRefresh(id);
}

// 치과 국가 선택이 바뀌었을 때 (따라가는 중이면 국가번호도 바꿔요, 뒷번호는 그대로)
function uiPhoneSetCountry(id, country) {
  var sel = document.getElementById(id + '-dial');
  if (!sel) return;
  var c = cncNormCountry(country);
  sel.setAttribute('data-clinic', c);
  if (sel.getAttribute('data-follow') === '1') {
    if (!sel.querySelector('option[value="' + c + '"]')) sel.insertAdjacentHTML('beforeend', '<option value="' + c + '">' + escHtml(cncCountryOption(c, currentLang).label) + '</option>');
    sel.value = c;
  } else if (sel.value === c) {
    sel.setAttribute('data-follow', '1');
  }
  _uiPhoneRefresh(id);
}

// 글자 정리: 입력 중에는 + / 00 으로 시작하는 통째 번호만, 붙여넣기 · 칸을 떠날 때는 앞의 0 까지
function uiPhoneInput(id, full) {
  var input = document.getElementById(id);
  var sel = document.getElementById(id + '-dial');
  if (!input || !sel) return;
  var v = input.value;
  var intl = /^\s*(\+|00)/.test(v);
  if (!full && !(intl && v.replace(/[^0-9]/g, '').length >= 6)) return;
  var p = cncParsePhoneInput(v, sel.value);
  if (p.country && p.country !== sel.value) {
    if (!sel.querySelector('option[value="' + p.country + '"]')) sel.insertAdjacentHTML('beforeend', '<option value="' + p.country + '">' + escHtml(cncCountryOption(p.country, currentLang).label) + '</option>');
    sel.value = p.country;
    sel.setAttribute('data-follow', p.country === sel.getAttribute('data-clinic') ? '1' : '0');
    _uiPhoneRefresh(id);
  }
  // 입력 중에는 국가번호가 들어간 통째 번호일 때만, 붙여넣기 · 칸을 떠날 때는 늘 숫자만 남겨요
  if ((full || intl) && p.rest !== v) input.value = p.rest;
}

// 지금 칸 상태 { dial, rest, follow } — 화면을 다시 그리기 전에 읽어 두었다가 uiPhoneField({ state }) 로 (칸이 없으면 null)
function uiPhoneState(id) {
  var input = document.getElementById(id);
  var sel = document.getElementById(id + '-dial');
  if (!input || !sel) return null;
  return { dial: sel.value, rest: input.value, follow: sel.getAttribute('data-follow') === '1' };
}

// '+66812345678' (뒷번호가 비면 '')
function uiPhoneRaw(id) {
  var input = document.getElementById(id);
  var sel = document.getElementById(id + '-dial');
  if (!input) return '';
  if (!sel) return input.value.trim();
  // 정리 전에 저장을 눌러도 붙여넣은 국가번호를 읽어요
  var p = cncParsePhoneInput(input.value, sel.value);
  return cncComposePhone(p.country || sel.value, p.rest);
}

// 저장할 값 (치과 국가 규칙으로 정규화)
function uiPhoneValue(id, country) {
  var raw = uiPhoneRaw(id);
  return raw ? cncNormPhone(raw, country) : '';
}

// 칸 테두리를 빨갛게 (검사 에러)
function uiPhoneSetInvalid(id, on) {
  var wrap = document.getElementById(id + '-wrap');
  var input = document.getElementById(id);
  if (wrap) wrap.classList.toggle('invalid', !!on);
  if (input) input.classList.toggle('invalid', !!on);
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
    INSUFFICIENT_CREDITS_ABUTMENT: 'insufficient_credits_abutment',
    INSUFFICIENT_CREDITS_CROWN_SET: 'insufficient_credits_crown_set',
    INVALID_PRODUCT: 'err_invalid_product',
    SHADE_REQUIRED_CROWN_SET: 'err_shade_required_crown_set',
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
    CANNOT_REMOVE_SELF: 'team_err_remove_self',
    bonus_address_only: 'free_err_address_only',
    NO_REGISTERED_CLINIC: 'free_err_no_registered',
    EVENT_REQUIRED: 'admin_free_err_event',
    REASON_REQUIRED: 'admin_free_err_reason',
    PHONE_TAKEN: 'err_phone_taken',
    PHONE_INVALID: 'err_phone',
    TAX_ID_TAKEN: 'err_tax_id_taken',
    TAX_ID_INVALID: 'err_tax_id_checksum',
    EMAIL_DISPOSABLE: 'err_email_disposable',
    PROFILE_INCOMPLETE: 'err_profile_incomplete',
    // 영업 · 커미션 (sql/015)
    COMMISSION_LOCKED: 'rep_err_locked',
    REP_NOT_FOUND: 'rep_err_not_found',
    MONTH_NOT_ENDED: 'comm_err_month',
    ALREADY_PAID: 'comm_err_already_paid',
    NOT_PAID: 'comm_err_not_paid',
    NOT_SALES: 'admin_err_not_admin',
    // 직원 계정 · 초대 링크 (sql/023)
    INVITE_INVALID: 'join_invalid',
    STAFF_ACCOUNT: 'err_staff_account',
    CANNOT_CHANGE_SELF: 'err_cannot_change_self',
    HAS_CREDITS: 'err_has_credits',
    HAS_ACTIVE_ORDERS: 'err_has_active_orders',
    NOT_CUSTOMER: 'err_not_customer',
    INVALID_HOURS: 'err_invalid_hours',
    INVALID_RATE_VALUE: 'rate_err_value',
    INVALID_RATE_TYPE: 'rate_err_type',
    INVALID_MONTH: 'err_invalid_month',
    // 크레딧 나누기 검사 (sql/018 · 019)
    CREDIT_SPLIT_MISMATCH: 'err_credit_split_mismatch',
    // 광고 배너 · 방문 기록 (sql/019)
    INVALID_KIND: 'err_invalid_action',
    // 기간 검사 (sql/013 · sql/023)
    INVALID_RANGE: 'err_invalid_range',
    RANGE_TOO_LONG: 'err_range_too_long',
    INVALID_URL: 'ad_err_link',
    NAME_REQUIRED: 'err_required',
    INVALID_SLOT: 'ad_err_slot',
    IMAGE_REQUIRED: 'ad_err_image_required',
    INVALID_DATES: 'ad_err_dates',
    // 주문 파일 보관 기간 (sql/020)
    RUN_NOT_FOUND: 'err_not_found',
    INVALID_MONTHS: 'ret_err_months',
    INVALID_MODE: 'err_invalid_action',
    // 세금계산서 · 영수증 · 치과 소재 국가 (sql/021)
    TAX_SETTINGS_MISSING: 'err_tax_settings_missing',
    RECEIPT_SETTINGS_MISSING: 'err_receipt_settings_missing',
    ALREADY_ISSUED: 'tax_already_issued',
    NOT_APPROVED: 'err_not_approved',
    DOC_IMMUTABLE: 'err_doc_immutable',
    BRANCH_INVALID: 'tax_branch_invalid',
    TAX_ID_REQUIRED: 'err_tax_id_required_th',   // 국가를 태국으로 바꾸는 변경 요청에 올바른 Tax ID 가 없을 때
    NO_DOCS: 'err_no_docs',
    INVALID_DATE: 'tax_err_future_date'
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

// 보관 기간이 지나 파일을 지운 주문 (sql/020) — 오류처럼 보이지 않게 회색 안내 상자
//   고객: "🗂 보관 기간이 지나 파일이 삭제됐어요 (날짜)" + 주문 기록은 남아 있다는 설명 / 관리자: 지운 파일 수도
function uiRetentionNote(order, admin) {
  var when = order && order.files_purged_at ? formatDate(order.files_purged_at) : '';
  return '<div class="retention-note" role="note"><span class="retention-note-icon" aria-hidden="true">🗂</span><div>' +
    '<p class="retention-note-title">' + escHtml(t('ret_files_deleted_title')) + (when ? ' <span class="muted">· ' + escHtml(when) + '</span>' : '') + '</p>' +
    '<p class="retention-note-text">' + escHtml(admin ? tf('ret_files_deleted_admin', { n: Number(order.files_purged_count) || 0 }) : t('ret_files_deleted_text')) + '</p>' +
    '</div></div>';
}

// 처리 이력 타임라인 (review_history)
// showNames: 관리자 화면에서만 true → 처리한 직원 이름(by_name)을 보여줘요 (고객 화면은 "관리자")
// 고객 화면에서 숨기는 관리자 전용 기록 (담당 영업 변경 — sql/015 때 주문에 남은 기록, 016 부터는 새로 안 생겨요)
var ADMIN_ONLY_HISTORY_ACTIONS = ['rep_changed'];

function uiHistoryList(history, showNames) {
  history = (history || []).filter(function (h) {
    return showNames || !h || ADMIN_ONLY_HISTORY_ACTIONS.indexOf(h.action) === -1;
  });
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
        // 납품일 (디자인 승인 때 확정 · 관리자 납기 변경 — sql/012)
        (h.deadline ? '<p class="timeline-deadline">📅 ' + escHtml(t('case_deadline_label')) + ': ' +
          (h.old_deadline ? escHtml(formatDate(h.old_deadline)) + ' → ' : '') + '<b>' + escHtml(formatDate(h.deadline)) + '</b></p>' : '') +
        // 담당 영업 변경 (관리자 화면만): 이전 → 새 담당 이름 (이름은 영업 담당 목록에서)
        (h.action === 'rep_changed' ? '<p class="timeline-rep">👤 ' + escHtml(uiRepNameOrNone(h.old_rep)) + ' → <b>' + escHtml(uiRepNameOrNone(h.new_rep)) + '</b></p>' : '') +
        (h.note ? '<p class="pre timeline-note">' + escHtml(h.note) + '</p>' : '') +
      '</div></li>';
  }).join('') + '</ol>';
}



// 담당 영업 이름 (없으면 "담당 없음", 목록에 없으면 id 앞자리)
function uiRepNameOrNone(id) {
  if (!id) return t('rep_none');
  var name = (typeof cncRepName === 'function' && typeof _salesRepsCache !== 'undefined') ? cncRepName(_salesRepsCache, id) : '';
  return name || String(id).slice(0, 8);
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
//   + "판매: 회사명 · 제조: 제조사" 한 줄 (제조사 이름이 있을 때만, sql/026)
//   + 광고 허가 번호 한 줄 (값이 있을 때만, **로그인 전 화면의 푸터에만** — 앱 화면(#screen-app) 푸터에는 없어요)
function renderFooters() {
  var c = (typeof _companyCache !== 'undefined' && _companyCache) || {};
  var name = c.company_name || 'allAbut';
  var mfr = typeof cncManufacturerInfo === 'function' ? cncManufacturerInfo() : { name: '', adLicenseNo: '' };
  var html = footerContactHtml() +
    '<nav class="footer-links" aria-label="' + escHtml(t('legal_documents')) + '">' +
    ['<a href="#/about" class="footer-about">' + escHtml(t('about_nav')) + '</a>'].concat(LEGAL_DOCS_LIST.map(function (d) {
      return '<a href="#/' + d.route + '">' + escHtml(t(d.titleKey)) + '</a>';
    })).join('<span aria-hidden="true">·</span>') +
    '</nav>' +
    (mfr.name ? '<p class="footer-maker">' + escHtml(tf('footer_sold_by', { seller: name, maker: mfr.name })) + '</p>' : '') +
    '<p class="footer-copy">© 2026 ' + escHtml(name) + '</p>';
  var adLine = mfr.adLicenseNo ? '<p class="footer-ad-license">' + escHtml(tf('footer_ad_license', { no: mfr.adLicenseNo })) + '</p>' : '';
  var els = document.querySelectorAll('.site-footer');
  for (var i = 0; i < els.length; i++) {
    var inApp = !!(els[i].closest && els[i].closest('#screen-app'));
    els[i].innerHTML = html + (inApp ? '' : adLine);
  }
  updatePublicFooterSpace();
}

// 랜딩 · 로그인 화면의 고정 푸터 높이 → 본문 아래 여백 (줄이 늘어도 본문이 푸터에 가리지 않게, css/landing.css --public-footer-h)
function updatePublicFooterSpace() {
  var f = document.querySelector('.public-footer');
  if (!f || !f.offsetHeight) return;
  document.documentElement.style.setProperty('--public-footer-h', f.offsetHeight + 'px');
}
window.addEventListener('resize', function () { updatePublicFooterSpace(); });


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
