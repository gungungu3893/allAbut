// ===== 다국어 (9개 언어) =====
// - 번역 글자는 lang/lang-xx.js 파일에 있어요 (LANG.en, LANG.ko ...).
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
function tf(key, params) {
  var text = t(key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, function (all, name) {
    return params[name] != null ? String(params[name]) : all;
  });
}


// ===== 언어 바꾸기 =====
function setLang(code) {
  if (!isSupportedLang(code)) code = 'en';
  currentLang = code;
  try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch (e) { /* 무시 */ }
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
