// ===== 다국어 (9개 언어) =====
// - 번역 글자는 lang/lang-xx.js 파일에 있어요 (LANG.en, LANG.ko ...).
// - 처음에는 영어(대체용, index.html) + 지금 언어만 받아요. 다른 언어는 고를 때 받아요 (cncLoadLang — loader.js 의 cncLoadScript, ?v= 캐시 규칙 그대로).
//   못 받으면 영어로 보여 주고 조용히 다시 시도 → 받으면 화면을 다시 그려요.
// - t('키')            → 현재 언어 글자 (없으면 영어, 그것도 없으면 키 그대로)
// - tf('키', { n: 3 }) → 글자 안의 {n} 같은 자리를 값으로 바꿔요
// - setLang('ko')      → 언어 바꾸기 (아랍어·페르시아어는 오른쪽→왼쪽(RTL) 화면)

window.LANG = window.LANG || {};

// 지원 언어 목록 (드롭다운에 이 순서로 보여요)
var LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
  { code: 'th', name: 'ไทย' },
  { code: 'zh', name: '中文' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'es', name: 'Español' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'fa', name: 'فارسی', rtl: true }
];

var LANG_STORAGE_KEY = 'lang';

function isSupportedLang(code) {
  for (var i = 0; i < LANGUAGES.length; i++) {
    if (LANGUAGES[i].code === code) return true;
  }
  return false;
}

function isRtlLang(code) {
  for (var i = 0; i < LANGUAGES.length; i++) {
    if (LANGUAGES[i].code === code) return !!LANGUAGES[i].rtl;
  }
  return false;
}

// 저장된 언어 (없거나 이상한 값이면 영어)
var currentLang = (function () {
  var saved = null;
  try { saved = localStorage.getItem(LANG_STORAGE_KEY); } catch (e) { /* 저장소 사용 불가 */ }
  return isSupportedLang(saved) ? saved : 'en';
})();

// 언어를 직접 고른 적이 있는지 (없으면 로그인 후 프로필의 언어를 따라가요)
function hasSavedLang() {
  try { return !!localStorage.getItem(LANG_STORAGE_KEY); } catch (e) { return false; }
}


// ===== 번역 함수 =====
function t(key) {
  var table = LANG[currentLang];
  if (table && table[key] != null) return table[key];
  if (LANG.en && LANG.en[key] != null) return LANG.en[key];
  return key;
}

// 영어 글자 (주문 데이터에 영어 이름을 저장할 때 사용)
function tEn(key) {
  return (LANG.en && LANG.en[key] != null) ? LANG.en[key] : key;
}

// 자리 바꾸기: tf('teeth_selected', { n: 3 }) → "3 teeth selected"
//   n 이 1 이고 지금 언어에 "키_one" 이 있으면 그 문구 (영어 "1 tooth" · 스페인어 "1 diente" · 아랍어 "سن واحد").
//   단수 · 복수 구별이 없는 언어(한국어 · 태국어 · 중국어 · 베트남어 · 터키어 · 페르시아어)는 _one 이 없어서 그대로 — 영어로 넘어가지 않아요
function tf(key, params) {
  if (params && Number(params.n) === 1) {
    var table = LANG[currentLang];
    if (table && table[key + '_one'] != null) key = key + '_one';
  }
  var text = t(key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, function (all, name) {
    return params[name] != null ? String(params[name]) : all;
  });
}


// ===== 언어 파일 불러오기 =====
var LANG_WAIT_MS = 4000;                                   // 이 시간 안에 못 받으면 우선 영어로 보여 줘요
var LANG_RETRY_DELAYS = [3000, 10000, 30000, 60000];       // 못 받았을 때 다시 시도하는 간격 (마지막 값으로 계속)
var LANG_RETRY_MAX = 10;
var _langRetry = {};          // 언어별 다시 시도 중인지
var _langNeedsRefresh = {};   // 그 언어 파일 없이(영어로) 화면을 그린 적이 있는지 → 받으면 다시 그려요

function langFilePath(code) {
  return 'lang/lang-' + code + '.js';
}

// 언어 파일 받기 → Promise(true = 받음 / false = 못 받음). 이미 있으면 바로 true
function cncLoadLang(code) {
  if (!isSupportedLang(code)) code = 'en';
  if (LANG[code]) return Promise.resolve(true);
  return cncLoadScript(langFilePath(code)).then(function () {
    langArrived(code);
    return !!LANG[code];
  }, function () {
    _langNeedsRefresh[code] = true;   // 못 받았으니 이 언어는 영어로 보여요
    scheduleLangRetry(code);
    return false;
  });
}

// 정해진 시간까지만 기다리기 (늦으면 영어로 먼저 보여 주고, 도착하면 다시 그려요)
function cncLoadLangWithin(code, ms) {
  if (!isSupportedLang(code)) code = 'en';
  if (LANG[code]) return Promise.resolve(true);
  return cncWithin(cncLoadLang(code), ms == null ? LANG_WAIT_MS : ms).then(function (ok) {
    if (!ok && !LANG[code]) _langNeedsRefresh[code] = true;
    return !!LANG[code];
  });
}

// 조용히 다시 시도
function scheduleLangRetry(code) {
  if (_langRetry[code]) return;
  _langRetry[code] = true;
  var tries = 0;
  function again() {
    var wait = LANG_RETRY_DELAYS[Math.min(tries, LANG_RETRY_DELAYS.length - 1)];
    setTimeout(function () {
      if (LANG[code]) { _langRetry[code] = false; langArrived(code); return; }
      cncLoadScript(langFilePath(code)).then(function () {
        _langRetry[code] = false;
        langArrived(code);
      }, function () {
        tries++;
        if (tries < LANG_RETRY_MAX) again();
        else _langRetry[code] = false;   // 다음에 언어를 고르면 다시 시도해요
      });
    }, wait);
  }
  again();
}

// 늦게 도착한 언어 파일 → 지금 그 언어를 쓰고 있으면 화면을 다시 그려요
function langArrived(code) {
  if (!LANG[code] || !_langNeedsRefresh[code]) return;
  _langNeedsRefresh[code] = false;
  if (code !== currentLang) return;
  applyLangToDocument();
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
}


// ===== 언어 바꾸기 =====
// 파일이 이미 있으면 바로 바꿔요. 없으면 받은 뒤에 바꾸고 화면을 다시 그려요 (늦으면 영어로 먼저 → 도착하면 다시)
var _langWanted = null;
function setLang(code) {
  if (!isSupportedLang(code)) code = 'en';
  try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch (e) { /* 무시 */ }
  _langWanted = code;
  if (LANG[code]) {
    useLang(code);
    return Promise.resolve(true);
  }
  return cncLoadLangWithin(code).then(function (ok) {
    if (_langWanted !== code) return ok;   // 기다리는 사이 다른 언어를 골랐으면 그 언어를 따라가요
    useLang(code);
    return ok;
  });
}

function useLang(code) {
  currentLang = code;
  applyLangToDocument();
  // 화면들이 다시 그려지도록 알려요 (ui/router.js 가 듣고 있어요)
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
}

// <html lang="..." dir="..."> 와 고정 글자(data-i18n) 반영
function applyLangToDocument() {
  var html = document.documentElement;
  html.lang = currentLang;
  html.dir = isRtlLang(currentLang) ? 'rtl' : 'ltr';
  applyStaticTranslations(document);
}

// HTML 안의 data-i18n="키" → 글자, data-i18n-placeholder="키" → 입력칸 안내 글자
function applyStaticTranslations(root) {
  var els = root.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) {
    els[i].textContent = t(els[i].getAttribute('data-i18n'));
  }
  var phs = root.querySelectorAll('[data-i18n-placeholder]');
  for (var j = 0; j < phs.length; j++) {
    phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-placeholder')));
  }
}


// ===== 숫자 · 날짜 표시 (언어에 맞게) =====
// 날짜·숫자는 서양 숫자(0~9)로 통일해서 주문번호·납기를 헷갈리지 않게 해요
function localeTag() {
  return currentLang + '-u-nu-latn';
}

function formatDate(value) {
  if (!value) return '—';
  var d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    var p = String(value).split('-');
    d = new Date(+p[0], +p[1] - 1, +p[2]);   // 'YYYY-MM-DD' 는 현지 날짜로
  } else {
    d = new Date(value);
  }
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  var d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

// 시각만: "09:15 AM" / "09:15" (언어에 따라) — 오늘 묶음처럼 날짜가 이미 보일 때
function formatTime(value) {
  if (!value) return '—';
  var d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return d.toISOString().slice(11, 16);
  }
}

function formatNumber(n) {
  try { return Number(n || 0).toLocaleString(localeTag()); } catch (e) { return String(n || 0); }
}

// 파일 크기: 1536000 → "1.5 MB"
function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 금액: 21935 → "21,935.00 THB" (언어와 상관없이 쉼표 천 단위)
function formatTHB(n) {
  var v = Number(n || 0);
  try {
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' THB';
  } catch (e) {
    return v.toFixed(2) + ' THB';
  }
}


// ===== 처음: 지금 언어 파일을 바로 받기 시작 (다른 스크립트를 받는 동안 같이) =====
//   app.js 의 boot 가 cncLoadLangWithin(currentLang) 으로 기다려요
cncLoadLang(currentLang);
