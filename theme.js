// ===== 사이트 디자인 스위치 (config.js 의 SITE_THEME) =====
// <head> 에서 config.js 바로 다음에 읽어요 → 화면을 그리기 전에 <html data-site-theme="mono|classic"> 를 붙여요.
//   - 'mono'   : 흑백 미니멀. 새 스타일은 전부 css/theme-mono.css 의 html[data-site-theme="mono"] 아래에만 있어요.
//   - 'classic': 예전 디자인 그대로 (theme-mono.css 규칙이 하나도 적용되지 않고, 이 파일도 아무것도 바꾸지 않아요).
// 되돌리기: config.js 의 SITE_THEME = 'classic'
(function () {
  var theme = (typeof SITE_THEME === 'string' && SITE_THEME === 'mono') ? 'mono' : 'classic';
  window.cncSiteTheme = function () { return theme; };
  window.cncIsMono = function () { return theme === 'mono'; };
  document.documentElement.setAttribute('data-site-theme', theme);
  if (theme !== 'mono') return;

  // 브라우저 주소창 색 (휴대폰) → 흰색
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#FFFFFF');

  // index.html 에 처음부터 있는 로고에 흑백 로고 클래스 (기존 클래스는 그대로 두고 logo-mono 만 더해요)
  //   (화면 코드가 만드는 로고는 ui/layout.js logoHtml · ui/page-about.js 가 직접 붙여요)
  function markLogos() {
    var els = document.querySelectorAll('.logo');
    for (var i = 0; i < els.length; i++) els[i].classList.add('logo-mono');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markLogos);
  else markLogos();
})();
