// ===== 필요할 때 불러오는 파일 (첫 접속을 가볍게) =====
// index.html 은 모든 사람이 쓰는 파일만 처음에 불러와요.
//   - 언어 파일: 영어(lang/lang-en.js, 대체용)만 index.html 에 있어요. 지금 언어는 lang.js 가 cncLoadLang() 으로 바로 불러와요.
//   - 관리자 · 영업 · 세금계산서 화면 파일(STAFF_SCRIPTS): 관리 팀이나 영업 담당이 로그인했을 때만 cncLoadStaffScripts() 로 불러와요.
// 불러오는 주소에는 배포 버전 ?v= 를 붙여요 (cncAssetQuery — index.html 의 내 파일과 같은 캐시 규칙).
// ⚠️ 관리자 · 영업 화면 파일을 새로 만들면 아래 STAFF_SCRIPTS 에 넣어요 (index.html 에는 넣지 않아요).
//    build.sh 가 이 목록의 파일이 dist/ 에 모두 있는지 검사해요.

// 배포 버전 → '?v=1a2b3c4d' (index.html 의 <meta name="asset-version">, build.sh 가 채워요. 로컬 'dev' 면 빈 글자)
function cncAssetQuery() {
  var m = document.querySelector('meta[name="asset-version"]');
  var v = m ? String(m.getAttribute('content') || '') : '';
  return v && v !== 'dev' ? '?v=' + encodeURIComponent(v) : '';
}

// 스크립트 파일 하나 불러오기 → Promise (같은 파일은 한 번만. 실패하면 기록을 지워서 다음에 다시 시도할 수 있어요)
var _scriptLoads = {};
function cncLoadScript(path) {
  if (_scriptLoads[path]) return _scriptLoads[path];
  var p = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = path + cncAssetQuery();
    s.async = false;
    s.onload = function () { resolve(true); };
    s.onerror = function () {
      if (s.parentNode) s.parentNode.removeChild(s);
      delete _scriptLoads[path];
      reject(new Error('Could not load ' + path));
    };
    document.head.appendChild(s);
  });
  _scriptLoads[path] = p;
  return p;
}

// 미리 받아 두기 (<link rel="preload">) — 여러 파일을 한꺼번에 받고, 실행은 순서대로 하려고
var _preloaded = {};
function cncPreloadScript(path) {
  if (_preloaded[path] || _scriptLoads[path]) return;
  _preloaded[path] = true;
  var l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'script';
  l.href = path + cncAssetQuery();
  document.head.appendChild(l);
}

// 기다리기 (최대 ms) → 시간 안에 끝나면 그 결과, 아니면 false
function cncWithin(promise, ms) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; resolve(false); } }, ms);
    promise.then(function (v) {
      if (done) return;
      done = true; clearTimeout(timer); resolve(v);
    }, function () {
      if (done) return;
      done = true; clearTimeout(timer); resolve(false);
    });
  });
}


// ----------------------------------------------------------------
// 관리자 · 영업 · 세금계산서 화면 (관리 팀 · 영업 담당만)
// ----------------------------------------------------------------
// 순서가 중요해요: 로직(cnc/) → ui/page-admin.js (PageAdmin 만들기) → 탭 파일들 (Object.assign(PageAdmin, …))
var STAFF_SCRIPTS = [
  'cnc/cnc-admin.js',
  'cnc/cnc-finance.js',
  'cnc/cnc-sales.js',
  'ui/page-admin.js',
  'ui/page-admin-finance.js',
  'ui/page-admin-team.js',
  'ui/page-admin-free.js',
  'ui/page-admin-visits.js',
  'ui/page-admin-ads.js',
  'ui/page-admin-retention.js',
  'ui/page-admin-tax.js',
  'ui/page-admin-sales.js',
  'ui/page-sales.js',
  'ui/page-admin-staff.js'
];

var _staffReady = false;
var _staffLoading = null;

// 관리자 화면 파일을 다 불러왔는지
function cncStaffScriptsReady() {
  return _staffReady;
}

// 관리자 화면 파일 불러오기 → Promise(true) / 실패하면 reject (다음 부를 때 실패한 파일부터 다시)
//   한꺼번에 미리 받고(preload) 실행은 목록 순서대로 하나씩
function cncLoadStaffScripts() {
  if (_staffReady) return Promise.resolve(true);
  if (_staffLoading) return _staffLoading;
  STAFF_SCRIPTS.forEach(cncPreloadScript);
  var i = 0;
  function next() {
    if (i >= STAFF_SCRIPTS.length) {
      _staffReady = true;
      return true;
    }
    return cncLoadScript(STAFF_SCRIPTS[i]).then(function () {
      i++;
      return next();
    });
  }
  _staffLoading = Promise.resolve().then(next).then(function (v) {
    _staffLoading = null;
    return v;
  }, function (err) {
    _staffLoading = null;
    throw err;
  });
  return _staffLoading;
}
