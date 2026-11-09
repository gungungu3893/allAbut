// ===== 해시 라우팅 =====
// 주소 끝의 #/home, #/guide, #/new, #/orders, #/profile, #/topup, #/admin 을 보고 맞는 페이지를 그려요.
// 법적 문서 #/terms, #/privacy, #/credit-policy, 문의하기 #/contact, 회사소개 #/about 은 로그인 없이도 볼 수 있어요 (로그인 전에는 screen-legal 화면).
// 주소에 페이지가 남아 있어서, 새로고침해도 같은 페이지가 다시 열려요.

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
  about: function () { return PageAbout; }       // 회사소개 (로그인 없이도)
};

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

  if (currentPage && currentPage.leave) currentPage.leave();
  window.currentRoute = name;
  currentPage = ROUTES[name]();
  setActiveNav(name);
  document.title = pageTitle(name);
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
