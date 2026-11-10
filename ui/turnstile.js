// ===== 로봇 차단 (Cloudflare Turnstile) =====
// 회원가입 · 로그인 · 비밀번호 찾기 폼에 위젯을 붙이고, 받은 토큰(captchaToken)을 Supabase Auth 호출에 넘겨요.
//   - config.js 의 TURNSTILE_SITE_KEY 가 비어 있으면 위젯을 숨기고 예전처럼 동작 (토큰 없이 호출)
//   - 시크릿 키는 코드에 넣지 않아요 → Supabase 대시보드 Authentication → Bot and Abuse Protection 에만
//   - 토큰은 한 번만 쓸 수 있어서, 호출이 끝나면 tsReset() 으로 새 토큰을 받아요
// 위젯 자리: <div class="ts-box" data-ts="signin"></div> (signin / signup / reset)

var TS = {
  loaded: false,
  loading: null,
  widgets: {},   // name → widget id
  tokens: {}     // name → 마지막 토큰
};

function tsEnabled() {
  return typeof TURNSTILE_SITE_KEY === 'string' && TURNSTILE_SITE_KEY.trim() !== '';
}

// 스크립트는 키가 있을 때만, 처음 한 번
function tsLoad() {
  if (!tsEnabled()) return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (TS.loading) return TS.loading;
  TS.loading = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = function () { resolve(window.turnstile || null); };
    s.onerror = function () { TS.loading = null; reject(new Error('turnstile load failed')); };
    document.head.appendChild(s);
  });
  return TS.loading;
}

// 화면에 있는 위젯 자리를 모두 그려요 (없으면 숨김)
function tsMountAll() {
  var boxes = document.querySelectorAll('.ts-box');
  for (var i = 0; i < boxes.length; i++) boxes[i].hidden = !tsEnabled();
  if (!tsEnabled()) return;
  tsLoad().then(function (ts) {
    if (!ts) return;
    for (var j = 0; j < boxes.length; j++) {
      var name = boxes[j].getAttribute('data-ts');
      if (TS.widgets[name] !== undefined) continue;
      (function (box, nm) {
        TS.widgets[nm] = ts.render(box, {
          sitekey: TURNSTILE_SITE_KEY.trim(),
          language: (typeof currentLang === 'string' ? currentLang : 'auto'),
          callback: function (token) { TS.tokens[nm] = token; },
          'expired-callback': function () { TS.tokens[nm] = ''; },
          'error-callback': function () { TS.tokens[nm] = ''; }
        });
      })(boxes[j], name);
    }
  }).catch(function (err) { console.warn(err); });
}

// 토큰 (키가 없으면 undefined → Supabase 에 안 넘겨요)
function tsToken(name) {
  if (!tsEnabled()) return undefined;
  return TS.tokens[name] || '';
}

// 키가 있는데 아직 체크를 안 했으면 true
function tsMissing(name) {
  return tsEnabled() && !TS.tokens[name];
}

function tsReset(name) {
  if (!tsEnabled() || !window.turnstile || TS.widgets[name] === undefined) return;
  TS.tokens[name] = '';
  try { window.turnstile.reset(TS.widgets[name]); } catch (e) { /* 무시 */ }
}
