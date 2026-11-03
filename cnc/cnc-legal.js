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

// 문서 본문 파일 불러오기 → LEGAL_DOCS['terms.en'] 같은 값
var _legalLoading = {};
function cncLoadLegalDoc(doc, lang) {
  var key = doc + '.' + lang;
  window.LEGAL_DOCS = window.LEGAL_DOCS || {};
  if (LEGAL_DOCS[key]) return Promise.resolve(LEGAL_DOCS[key]);
  if (_legalLoading[key]) return _legalLoading[key];
  _legalLoading[key] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'legal/' + key + '.js';
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
