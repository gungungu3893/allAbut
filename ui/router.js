// ===== 해시 라우팅 =====
// 주소 끝의 #/home, #/guide, #/new, #/orders, #/profile, #/admin 을 보고 맞는 페이지를 그려요.
// 주소에 페이지가 남아 있어서, 새로고침해도 같은 페이지가 다시 열려요.

var ROUTES = {
  home: function () { return PageHome; },
  guide: function () { return PageGuide; },
  new: function () { return PageNew; },
  orders: function () { return PageOrders; },
  profile: function () { return PageProfile; },
  admin: function () { return PageAdmin; }      // 관리자만 (아래 renderRoute 에서 확인)
};

window.currentRoute = null;
var currentPage = null;
var routerStarted = false;

// '#/orders' → 'orders' (모르는 주소면 'home')
function parseRoute(hash) {
  var m = /^#\/([a-z]+)/.exec(hash || '');
  var name = m ? m[1] : 'home';
  return ROUTES[name] ? name : 'home';
}

function navigate(route) {
  var target = '#/' + route;
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

// 지금 주소의 페이지 그리기 (로그인해서 앱 화면이 열려 있을 때만)
function renderRoute() {
  if (!window.APP || !APP.user) return;
  var main = document.getElementById('app-main');
  if (!main) return;

  var name = parseRoute(location.hash);
  if (!/^#\/[a-z]+/.test(location.hash || '')) {
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
  document.title = t('nav_' + name) + ' · allAbut';
  main.innerHTML = '';
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  currentPage.render(main);
  main.focus({ preventScroll: true });
}

// 언어가 바뀌면 지금 페이지를 같은 상태로 다시 그려요
function rerenderCurrent() {
  if (!window.APP || !APP.user || !currentPage) return;
  renderLayout();
  var main = document.getElementById('app-main');
  document.title = t('nav_' + window.currentRoute) + ' · allAbut';
  if (currentPage.rerender) currentPage.rerender(main);
  else { main.innerHTML = ''; currentPage.render(main); }
}

function startRouter() {
  if (routerStarted) { renderRoute(); return; }
  routerStarted = true;
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('langchange', rerenderCurrent);
  renderRoute();
}

// 로그아웃할 때: 지금 페이지 정리
function stopRouterPage() {
  if (currentPage && currentPage.leave) currentPage.leave();
  currentPage = null;
  window.currentRoute = null;
  var main = document.getElementById('app-main');
  if (main) main.innerHTML = '';
}
