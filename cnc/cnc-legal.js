// ===== 법적 문서 · 동의 · 회사 정보 · 계정 삭제 요청 (로직만, 화면 코드 없음) =====
// 화면은 ui/page-legal.js (문서), ui/layout.js (동의 창·푸터), ui/page-profile.js (삭제 요청), ui/page-admin.js (관리) 가 그려요.
//
// - 문서 본문: legal/{doc}.{lang}.js (영어가 기준, 태국어·한국어 번역). 필요할 때만 불러와요.
// - 버전: legal_versions (문서별 최신 = 시행일 → 등록 순서로 가장 나중 것)
// - 회사 정보: company_settings (로그인 전에도 읽을 수 있어요)

// 문서 목록 (주소 #/terms, #/privacy, #/credit-policy)
var LEGAL_DOCS_LIST = [
  { doc: 'terms', route: 'terms', titleKey: 'legal_terms' },
  { doc: 'privacy', route: 'privacy', titleKey: 'legal_privacy' },
  { doc: 'credit', route: 'credit-policy', titleKey: 'legal_credit' }
];
// 번역본이 있는 언어 (나머지 언어는 영어 본문 + 안내)
var LEGAL_TRANSLATED = ['en', 'th', 'ko'];

function legalDocForRoute(route) {
  return LEGAL_DOCS_LIST.filter(function (d) { return d.route === route; })[0] || null;
}

function isLegalRoute(route) {
  return !!legalDocForRoute(route);
}

// 배포 버전 → '?v=1a2b3c4d' (index.html 의 <meta name="asset-version">, build.sh 가 채워요. 로컬 'dev' 면 빈 글자)
function cncAssetQuery() {
  var m = document.querySelector('meta[name="asset-version"]');
  var v = m ? String(m.getAttribute('content') || '') : '';
  return v && v !== 'dev' ? '?v=' + encodeURIComponent(v) : '';
}

// 문서 본문 파일 불러오기 → LEGAL_DOCS['terms.en'] 같은 값
var _legalLoading = {};
function cncLoadLegalDoc(doc, lang) {
  var key = doc + '.' + lang;
  window.LEGAL_DOCS = window.LEGAL_DOCS || {};
  if (LEGAL_DOCS[key]) return Promise.resolve(LEGAL_DOCS[key]);
  if (_legalLoading[key]) return _legalLoading[key];
  _legalLoading[key] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'legal/' + key + '.js' + cncAssetQuery();   // 배포마다 바뀌는 ?v= (예전 문서가 캐시에 남지 않게)
    s.onload = function () { LEGAL_DOCS[key] ? resolve(LEGAL_DOCS[key]) : reject(new Error('missing ' + key)); };
    s.onerror = function () { delete _legalLoading[key]; reject(new Error('load failed ' + key)); };
    document.head.appendChild(s);
  });
  return _legalLoading[key];
}

// 지금 언어로 보여줄 문서: 번역본이 있으면 그것, 없거나 못 불러오면 영어
// 돌려주는 값: { data, lang, englishOnly }
async function cncGetLegalDoc(doc, lang) {
  if (LEGAL_TRANSLATED.indexOf(lang) !== -1 && lang !== 'en') {
    try {
      return { data: await cncLoadLegalDoc(doc, lang), lang: lang, englishOnly: false };
    } catch (err) {
      console.warn('Legal translation missing, using English:', err);
    }
  }
  return { data: await cncLoadLegalDoc(doc, 'en'), lang: 'en', englishOnly: lang !== 'en' };
}


// ================================================================
// 회사 정보 · 버전 (로그인 전에도 읽기 가능, 한 번 읽으면 기억)
// ================================================================
var _companyCache = null;
var _versionsCache = null;

async function cncGetCompany(force) {
  if (_companyCache && !force) return _companyCache;
  var row = cncCheck(await sb.from('company_settings').select('*').eq('id', 1).maybeSingle());
  _companyCache = row || {};
  return _companyCache;
}

// ----------------------------------------------------------------
// 문의 연락처 (company_settings 에서 — 하드코딩 금지)
// ----------------------------------------------------------------
// 값이 비어 있으면 그 항목은 화면에서 숨겨요. LINE ID 만 비어 있으면 기본 공식계정 @925caqxb
var DEFAULT_CONTACT_LINE_ID = '@925caqxb';

// { email, dpoEmail, phone, lineId, lineUrl, company, address }
function cncContactInfo() {
  var c = (typeof _companyCache !== 'undefined' && _companyCache) || {};
  var clean = function (v) { return String(v == null ? '' : v).trim(); };
  var lineId = clean(c.line_id) || DEFAULT_CONTACT_LINE_ID;
  return {
    email: clean(c.email),
    dpoEmail: clean(c.dpo_email),
    phone: clean(c.phone),
    lineId: lineId,
    lineUrl: cncLineUrl(lineId),
    company: clean(c.company_name),
    address: clean(c.address)
  };
}

// LINE 친구추가 주소: @925caqxb → https://line.me/R/ti/p/@925caqxb (이상한 글자는 빼요)
function cncLineUrl(lineId) {
  var id = String(lineId || '').trim().replace(/[^@A-Za-z0-9._-]/g, '');
  return 'https://line.me/R/ti/p/' + (id || DEFAULT_CONTACT_LINE_ID);
}

// mailto: 주소 (제목은 자동 입력, 글자는 URL 안전하게)
function cncMailto(email, subject) {
  var e = String(email || '').trim().replace(/[\s<>"]/g, '');
  return 'mailto:' + e + (subject ? '?subject=' + encodeURIComponent(subject) : '');
}

// 전화 걸기 주소: tel:+66812345678
function cncTelUrl(phone) {
  return 'tel:' + String(phone || '').replace(/[^0-9+]/g, '');
}

// ----------------------------------------------------------------
// 회사소개 #/about (company_settings 의 sql/007 칸들)
// ----------------------------------------------------------------
// 언어별로 다르게 쓸 수 있는 칸 (jsonb: { "en": "...", "th": "...", "ko": "..." })
var COMPANY_LOCALIZED_FIELDS = ['lead_time', 'delivery', 'remake_policy'];
// 관리자 화면에서 따로 입력칸을 주는 언어 (나머지 언어는 en 값을 보여줘요)
var COMPANY_INPUT_LANGS = ['en', 'th', 'ko'];
var DEFAULT_FOUNDED_YEAR = 2026;

// sql/007 을 실행했는지 (회사 정보에 founded_year 칸이 있는지)
function cncHasCompanyProfile() {
  var c = (typeof _companyCache !== 'undefined' && _companyCache) || {};
  return Object.prototype.hasOwnProperty.call(c, 'founded_year');
}

// 언어별 값 고르기: 지금 언어 → en → (글자 하나면 그대로). 없으면 ''
//   value: { en: '...', ko: '...' } 또는 '...' (예전처럼 글자 하나)
function cncLocalizedText(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') {
    var str = value.trim();
    if (str.charAt(0) === '{') { try { return cncLocalizedText(JSON.parse(str), lang); } catch (e) { /* 그냥 글자 */ } }
    return str;
  }
  if (typeof value !== 'object') return String(value).trim();
  var pick = function (k) { return typeof value[k] === 'string' ? value[k].trim() : ''; };
  return pick(lang) || pick('en');
}

// 관리자 입력 → 저장할 모양 { en: '...', th: '...' } (빈 언어는 빼요)
function cncCleanLocalized(obj) {
  var out = {};
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(function (k) {
      if (!/^[a-z]{2}$/.test(k)) return;
      var v = String(obj[k] == null ? '' : obj[k]).trim().slice(0, 500);
      if (v) out[k] = v;
    });
  }
  return out;
}

// "Osstem, Straumann ,, Nobel" → ['Osstem', 'Straumann', 'Nobel'] (같은 이름은 한 번만)
function cncCleanBrands(text) {
  var seen = {};
  return String(text || '').split(/[,，、\n]/).map(function (b) { return b.trim().slice(0, 60); }).filter(function (b) {
    var k = b.toLowerCase();
    if (!b || seen[k]) return false;
    seen[k] = true;
    return true;
  }).slice(0, 40);
}

// 회사소개 페이지에 쓸 값 (비어 있으면 '' / [])
//   { foundedYear, brands: [...], leadTime, delivery, remakePolicy }
function cncCompanyProfile(lang) {
  var c = (typeof _companyCache !== 'undefined' && _companyCache) || {};
  var year = parseInt(c.founded_year, 10);
  return {
    foundedYear: (year >= 1900 && year <= 2100) ? year : DEFAULT_FOUNDED_YEAR,
    brands: cncCleanBrands(c.implant_brands),
    leadTime: cncLocalizedText(c.lead_time, lang),
    delivery: cncLocalizedText(c.delivery, lang),
    remakePolicy: cncLocalizedText(c.remake_policy, lang)
  };
}

// 문서별 최신 버전: { terms: { version, effective_date }, privacy: {...}, credit: {...} }
async function cncGetLegalVersions(force) {
  if (_versionsCache && !force) return _versionsCache;
  var rows = cncCheck(await sb.from('legal_versions').select('*')
    .order('effective_date', { ascending: false }).order('created_at', { ascending: false })) || [];
  var latest = {};
  rows.forEach(function (r) { if (!latest[r.doc]) latest[r.doc] = r; });
  _versionsCache = latest;
  return latest;
}

// 모든 버전 (관리자 화면용, 문서별 최신순)
async function cncListLegalVersions() {
  return cncCheck(await sb.from('legal_versions').select('*')
    .order('doc', { ascending: true }).order('effective_date', { ascending: false }).order('created_at', { ascending: false })) || [];
}

// 다시 동의가 필요한지: 약관·개인정보 최신 버전과 내가 동의한 버전이 다르면 true
// (버전 기록이 아직 없으면 — SQL 실행 전 — 묻지 않아요)
function cncNeedsConsent(profile, versions) {
  if (!versions || !versions.terms || !versions.privacy) return false;
  profile = profile || {};
  return profile.terms_version !== versions.terms.version || profile.privacy_version !== versions.privacy.version;
}

// 내 동의 기록 (최신 버전으로)
async function cncAcceptLegal(versions) {
  var r = await sb.rpc('accept_legal', { p_terms_version: versions.terms.version, p_privacy_version: versions.privacy.version });
  if (r.error) throw cncError(cncErrorCode(r.error), { cause: r.error });
  if (window.APP && APP.profile) {
    APP.profile.terms_version = versions.terms.version;
    APP.profile.privacy_version = versions.privacy.version;
    APP.profile.accepted_at = r.data;
  }
  return r.data;
}


// ================================================================
// 계정 삭제 요청
// ================================================================
// 돌려주는 값: { id, status, already, active_orders, balance }
function cncRequestDeletion(reason) {
  return cncRpc('request_account_deletion', { p_reason: String(reason || '').trim() });
}

// 내 최근 삭제 요청 (없으면 null)
async function cncMyDeletionRequest() {
  var rows = cncCheck(await sb.from('account_deletion_requests').select('*').eq('user_id', cncUserId())
    .order('created_at', { ascending: false }).limit(1)) || [];
  return rows[0] || null;
}


// ================================================================
// 관리자: 회사 정보 · 법적 버전 · 삭제 요청
// ================================================================
async function cncAdminSaveCompany(fields) {
  var clean = {};
  ['company_name', 'address', 'tax_id', 'email', 'phone', 'line_id', 'dpo_email'].forEach(function (k) {
    clean[k] = String(fields[k] || '').trim();
  });
  // 회사소개(#/about) 칸 — sql/007 을 실행한 뒤에만 보내요 (안 하면 없는 칸이라 저장 전체가 실패해서)
  if (cncHasCompanyProfile()) {
    clean.implant_brands = cncCleanBrands(fields.implant_brands).join(', ');
    COMPANY_LOCALIZED_FIELDS.forEach(function (k) { clean[k] = cncCleanLocalized(fields[k]); });
    var year = parseInt(fields.founded_year, 10);
    clean.founded_year = (year >= 1900 && year <= 2100) ? year : null;
  }
  clean.updated_at = new Date().toISOString();
  var r = await sb.from('company_settings').update(clean).eq('id', 1).select();
  if (r.error) throw cncError(cncErrorCode(r.error), { cause: r.error });
  if (!r.data || !r.data.length) throw cncError('NOT_ADMIN');
  _companyCache = r.data[0];
  return r.data[0];
}

// 새 버전 등록 → 약관·개인정보면 모든 사용자가 다음 로그인 때 다시 동의
async function cncAdminAddLegalVersion(doc, version, effectiveDate) {
  var row = { doc: doc, version: String(version || '').trim(), effective_date: effectiveDate };
  if (!row.version || !row.effective_date) throw cncError('INVALID_AMOUNT');
  var r = await sb.from('legal_versions').insert(row).select();
  if (r.error) {
    if (/duplicate|unique/i.test(String(r.error.message || ''))) throw cncError('DUPLICATE_VERSION', { cause: r.error });
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  _versionsCache = null;
  return r.data && r.data[0];
}

// 삭제 요청 목록 (고객 이름 붙여서). status: 'pending' | 'all'
async function cncAdminListDeletionRequests(status) {
  var q = sb.from('account_deletion_requests').select('*');
  if (status && status !== 'all') q = q.eq('status', status);
  var rows = cncCheck(await q.order('created_at', { ascending: false }).limit(100)) || [];
  var ids = rows.map(function (r) { return r.user_id; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  if (ids.length) {
    try {
      var profiles = cncCheck(await sb.from('profiles').select('id, nickname, clinic_name, phone').in('id', ids)) || [];
      rows.forEach(function (r) { r.customer = profiles.filter(function (p) { return p.id === r.user_id; })[0] || null; });
    } catch (err) {
      console.warn('Customer names failed:', err);
    }
  }
  return rows;
}

function cncAdminHandleDeletion(id, status, note) {
  return cncRpc('admin_handle_deletion_request', { p_id: id, p_status: status, p_note: String(note || '').trim() });
}
