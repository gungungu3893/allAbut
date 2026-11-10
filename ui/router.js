// ===== 해시 라우팅 =====
// 주소 끝의 #/home, #/guide, #/new, #/orders, #/profile, #/topup, #/admin 을 보고 맞는 페이지를 그려요.
// 법적 문서 #/terms, #/privacy, #/credit-policy, 문의하기 #/contact, 회사소개 #/about 은 로그인 없이도 볼 수 있어요 (로그인 전에는 screen-legal 화면).
// 주소에 페이지가 남아 있어서, 새로고침해도 같은 페이지가 다시 열려요.
//
// LINE 알림 링크: https://allabut.com/?openExternalBrowser=1#/orders?id=CA261110-0012
//   - # 앞의 ?openExternalBrowser=1 은 LINE 이 휴대폰 기본 브라우저로 열게 하는 표시 → 열리면 주소창에서 지워요 (해시는 그대로)
//   - # 뒤의 ?id=… 은 그 주문을 자동으로 펼쳐요. 관리자는 #/admin/orders?order=… (또는 #/admin?order=…) → 주문 상세 창
//   - 로그인 전에 이런 링크로 오면 로그인 화면을 보여 주고, 로그인하면 그 페이지로 가요 (rememberPendingRoute)

var ROUTES = {
  home: function () { return PageHome; },
  guide: function () { return PageGuide; },
  new: function () { return PageNew; },
  orders: function () { return PageOrders; },
  profile: function () { return PageProfile; },
  topup: function () { return PageTopup; },
  admin: function () { return PageAdmin; },      // 관리자만 (아래 renderRoute 에서 확인)
  terms: function () { return PageLegal; },
  privacy: function () { return PageLegal; },
  'credit-policy': function () { return PageLegal; },
  contact: function () { return PageContact; },  // 문의하기 (로그인 없이도)
  about: function () { return PageAbout; },      // 회사소개 (로그인 없이도)
  complete: function () { return PageComplete; } // 필수 정보 입력 (본명 · 전화 · 치과명 · Tax ID · 주소가 비었을 때)
};

// ----------------------------------------------------------------
// LINE 링크 정리 · 바로가기
// ----------------------------------------------------------------
var EXTERNAL_QUERY_KEYS = ['openExternalBrowser'];
var PENDING_ROUTE_KEY = 'allabut_pending_route';
// 이번에 LINE 링크(?openExternalBrowser=1)로 들어왔는지 — 주소에서 지우기 전에 기억해요
var OPENED_FROM_LINE = /[?&]openExternalBrowser=/.test(location.search || '');

// 주소창에서 ?openExternalBrowser=1 지우기 (다른 쿼리와 # 뒤 해시는 그대로)
function cleanExternalQuery() {
  if (!location.search) return;
  var params = new URLSearchParams(location.search);
  var changed = false;
  EXTERNAL_QUERY_KEYS.forEach(function (k) { if (params.has(k)) { params.delete(k); changed = true; } });
  if (!changed) return;
  var rest = params.toString();
  history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
}
cleanExternalQuery();   // 스크립트가 읽히자마자 한 번 (페이지가 열리기 전)

// 해시 안의 쿼리: '#/orders?id=CA1' → URLSearchParams { id: 'CA1' }
function hashParams(hash) {
  var h = String(hash == null ? location.hash : hash);
  var i = h.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : h.slice(i + 1));
}

// 주문번호 모양만 남기기 (이상한 글자 제거)
function cleanRouteId(v) {
  return String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

// 바로가기: #/orders?id=… → 그 주문 펼치기 / #/admin…?order=… → 관리자 주문 상세 열기
function applyDeepLink(name) {
  var q = hashParams();
  var id = cleanRouteId(q.get('id'));
  var order = cleanRouteId(q.get('order'));
  if (name === 'orders' && id && window.PageOrders) PageOrders.openId = id;
  if (name === 'admin' && order && window.PageAdmin) PageAdmin.pendingOrder = order;
}

// LINE 링크로 로그인이 필요한 페이지에 왔는데 로그인 전일 때: 기억해 두고 true (로그인 후 goStartPage 가 꺼내 써요)
//   LINE 링크가 아닌 경우(예: 세션이 끝난 뒤 새로고침)는 예전처럼 랜딩 → 로그인 후 홈
function rememberPendingRoute() {
  if (!OPENED_FROM_LINE) return false;
  var h = location.hash || '';
  var m = /^#\/([a-z-]+)/.exec(h);
  if (!m || !ROUTES[m[1]] || isPublicRoute(m[1]) || m[1] === 'home') return false;
  try { sessionStorage.setItem(PENDING_ROUTE_KEY, h); } catch (e) { /* 저장 못 하면 그냥 홈으로 */ }
  return true;
}

// 기억해 둔 페이지 꺼내기 (한 번만)
function takePendingRoute() {
  try {
    var h = sessionStorage.getItem(PENDING_ROUTE_KEY);
    sessionStorage.removeItem(PENDING_ROUTE_KEY);
    return h && /^#\/[a-z-]+/.test(h) ? h : null;
  } catch (e) {
    return null;
  }
}

window.currentRoute = null;
var currentPage = null;
var publicPageActive = false;   // 로그인 전 법적 문서 화면이 열려 있는지

// '#/orders' → 'orders' (모르는 주소면 'home')
function parseRoute(hash) {
  var m = /^#\/([a-z-]+)/.exec(hash || '');
  var name = m ? m[1] : 'home';
  return ROUTES[name] ? name : 'home';
}

// 로그인 없이 볼 수 있는 페이지인지 (법적 문서 + 문의하기 + 회사소개)
function isPublicRoute(name) {
  return name === 'contact' || name === 'about' || isLegalRoute(name);
}

// 주소가 지금 로그인 없이 볼 수 있는 페이지인지 (이름은 예전 그대로)
function isLegalHash() {
  var m = /^#\/([a-z-]+)/.exec(location.hash || '');
  return !!(m && isPublicRoute(m[1]));
}

function navigate(route) {
  var target = '#/' + route;
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

function pageTitle(name) {
  var doc = legalDocForRoute(name);
  if (name === 'contact') return t('contact_title') + ' · allAbut';
  if (name === 'about') return t('about_meta_title');
  if (name === 'complete') return t('complete_title') + ' · allAbut';
  return (doc ? t(doc.titleKey) : t('nav_' + name)) + ' · allAbut';
}

// 로그인 전: 법적 문서면 screen-legal 에 그리고, 아니면 랜딩으로
function renderPublicRoute() {
  if (isLegalHash()) {
    var main = document.getElementById('legal-main');
    if (!main) return;
    var name = parseRoute(location.hash);
    if (currentPage && currentPage.leave) currentPage.leave();
    window.currentRoute = name;
    currentPage = ROUTES[name]();
    publicPageActive = true;
    document.title = pageTitle(name);
    setActiveNav(name);   // 로그인 전 헤더의 "회사소개" 강조
    showScreen('legal');
    window.scrollTo(0, 0);
    currentPage.render(main);
    return;
  }
  if (publicPageActive) {
    publicPageActive = false;
    if (currentPage && currentPage.leave) currentPage.leave();
    currentPage = null;
    window.currentRoute = null;
    document.title = 'allAbut 5μm';
    showScreen('landing');
  }
}

// 지금 주소의 페이지 그리기
function renderRoute() {
  cleanExternalQuery();
  if (!window.APP || !APP.user) { renderPublicRoute(); return; }
  publicPageActive = false;
  var main = document.getElementById('app-main');
  if (!main) return;

  var name = parseRoute(location.hash);
  if (!/^#\/[a-z-]+/.test(location.hash || '')) {
    history.replaceState(null, '', '#/' + name);   // 주소를 #/home 처럼 맞춰 둬요
  }
  // 관리자가 아닌 사람이 #/admin 으로 들어오면 홈으로
  if (name === 'admin' && !APP.isAdmin) {
    name = 'home';
    history.replaceState(null, '', '#/home');
  }
  // 필수 정보가 비어 있으면 정보 입력 화면만 (법적 문서 · 문의 · 회사소개는 열어 둬요) — sql/010
  if (APP.needsInfo && name !== 'complete' && !isPublicRoute(name)) {
    name = 'complete';
    history.replaceState(null, '', '#/complete');
  }
  if (name === 'complete' && !APP.needsInfo) {
    name = 'home';
    history.replaceState(null, '', '#/home');
  }

  if (currentPage && currentPage.leave) currentPage.leave();
  window.currentRoute = name;
  currentPage = ROUTES[name]();
  setActiveNav(name);
  document.title = pageTitle(name);
  applyDeepLink(name);   // #/orders?id=… · #/admin/orders?order=…
  main.innerHTML = '';
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  currentPage.render(main);
  main.focus({ preventScroll: true });

  // 바뀐 약관·개인정보에 아직 동의하지 않았으면 동의 창 (법적 문서는 읽을 수 있게 열어 둬요)
  updateConsentGate();
}

// 언어가 바뀌면 지금 페이지를 같은 상태로 다시 그려요
function rerenderCurrent() {
  renderFooters();
  if (!window.APP || !APP.user) {
    if (publicPageActive && currentPage) {
      document.title = pageTitle(window.currentRoute);
      currentPage.rerender(document.getElementById('legal-main'));
    }
    return;
  }
  if (!currentPage) return;
  renderLayout();
  var main = document.getElementById('app-main');
  document.title = pageTitle(window.currentRoute);
  if (currentPage.rerender) currentPage.rerender(main);
  else { main.innerHTML = ''; currentPage.render(main); }
  updateConsentGate();
}

// 로그인 후 앱을 열 때
function startRouter() {
  renderRoute();
}

// 로그아웃할 때: 지금 페이지 정리
function stopRouterPage() {
  if (currentPage && currentPage.leave) currentPage.leave();
  currentPage = null;
  window.currentRoute = null;
  publicPageActive = false;
  var main = document.getElementById('app-main');
  if (main) main.innerHTML = '';
  hideConsentGate();
}

// 주소가 바뀔 때 · 언어가 바뀔 때 (로그인 전후 모두)
window.addEventListener('hashchange', renderRoute);
window.addEventListener('langchange', rerenderCurrent);
