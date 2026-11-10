// ================================================================
// allAbut — 회원 필수 정보 · 정규화 · 가입 확인 · 신규 가입 무료 크레딧 이벤트 (로직만, 화면 코드 없음)
// ================================================================
// DB: sql/010_signup_identity_campaign.sql — 정규화 규칙은 SQL 과 똑같아요 (한쪽을 바꾸면 다른 쪽도)
//   전화   cncNormPhone   = 숫자만, +66/66 으로 시작하면 0 으로        (SQL _norm_phone)
//   Tax ID cncNormTaxId   = 숫자만 / cncValidTaxId = 13자리 + 태국 체크섬 (SQL _norm_tax_id / _valid_tax_id)
//          체크섬: 앞 12자리 × 13..2 의 합 → (11 - 합 % 11) % 10 = 13번째 자리
//   필수: 본명 · 전화 · 치과명 · 치과 Tax ID · 치과 주소 → 하나라도 없으면 주문 불가 (DB 도 PROFILE_INCOMPLETE)
//   본명 · Tax ID 는 처음 채워지면 잠겨요 → 바꾸려면 등록 정보 변경 요청 (관리자 승인)

// ----------------------------------------------------------------
// 정규화 · 검사
// ----------------------------------------------------------------
function cncNormPhone(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (/^66[0-9]{8,}$/.test(d)) d = '0' + d.slice(2);
  return d;
}

function cncValidPhone(v) {
  return /^[0-9]{9,15}$/.test(cncNormPhone(v));
}

function cncNormTaxId(v) {
  return String(v == null ? '' : v).replace(/[^0-9]/g, '');
}

function cncValidTaxId(v) {
  var d = cncNormTaxId(v);
  if (!/^[0-9]{13}$/.test(d)) return false;
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += Number(d.charAt(i)) * (13 - i);
  return (11 - sum % 11) % 10 === Number(d.charAt(12));
}

// 본명: 앞뒤 공백 · 겹친 공백 정리
function cncNormName(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

// 보기 좋게: 0812345678 → 081-234-5678 / 13자리 Tax ID → 0-1055-56123-45-3
function cncFormatTaxId(v) {
  var d = cncNormTaxId(v);
  return d.length === 13 ? d.slice(0, 1) + '-' + d.slice(1, 5) + '-' + d.slice(5, 10) + '-' + d.slice(10, 12) + '-' + d.slice(12) : String(v || '');
}

// ----------------------------------------------------------------
// 일회용 메일 (SQL blocked_email_domains 와 같은 목록)
// ----------------------------------------------------------------
var DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com', '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'sharklasers.com', 'grr.la', 'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com', 'mytemp.email', 'tempail.com'
];

function cncIsDisposableEmail(email) {
  var dom = String(email || '').toLowerCase().split('@')[1] || '';
  return DISPOSABLE_EMAIL_DOMAINS.some(function (d) { return dom === d || dom.slice(-(d.length + 1)) === '.' + d; });
}

// ----------------------------------------------------------------
// 필수 정보
// ----------------------------------------------------------------
var PROFILE_REQUIRED_FIELDS = ['full_name', 'phone', 'clinic_name', 'tax_id', 'address'];

// 010 을 실행한 DB 인지 (프로필에 full_name 칸이 있는지) — 실행 전이면 예전처럼 막지 않아요
function cncHasIdentityColumns(profile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, 'full_name');
}

// 비어 있거나 잘못된 필수 칸 목록 (예: ['tax_id', 'address'])
function cncMissingProfileFields(profile) {
  var p = profile || {};
  return PROFILE_REQUIRED_FIELDS.filter(function (k) {
    if (k === 'phone') return !cncValidPhone(p.phone);
    if (k === 'tax_id') return !cncValidTaxId(p.tax_id);
    return !cncNormName(p[k]);
  });
}

// 정보 입력 화면을 보여줘야 하는지 (010 실행 후 + 필수 칸이 빔)
function cncNeedsProfileInfo(profile) {
  return cncHasIdentityColumns(profile) && cncMissingProfileFields(profile).length > 0;
}

// 잠긴 칸인지 (본명 · 올바른 Tax ID 는 처음 채워지면 잠겨요)
function cncIdentityLocked(profile, field) {
  var p = profile || {};
  if (field === 'full_name') return !!cncNormName(p.full_name);
  if (field === 'tax_id') return cncValidTaxId(p.tax_id);
  return false;
}

// 가입 폼·정보 입력 폼 검사 → { field: '에러 번역 키' }
//   fields: { full_name, phone, clinic_name, tax_id, address }
function cncValidateIdentity(fields) {
  var e = {};
  if (!cncNormName(fields.full_name)) e.full_name = 'err_full_name_required';
  if (!String(fields.phone || '').trim()) e.phone = 'err_phone_required';
  else if (!cncValidPhone(fields.phone)) e.phone = 'err_phone';
  if (!cncNormName(fields.clinic_name)) e.clinic_name = 'err_clinic_required';
  if (!String(fields.tax_id || '').trim()) e.tax_id = 'err_tax_id_required';
  else if (!cncValidTaxId(fields.tax_id)) e.tax_id = 'err_tax_id_checksum';
  if (!cncNormName(fields.address)) e.address = 'err_address_required';
  return e;
}

// ----------------------------------------------------------------
// 가입 전 확인 (로그인 전) → { phone_taken, tax_id_taken, email_blocked } — 010 실행 전이면 모두 false
// ----------------------------------------------------------------
async function cncCheckSignupAvailable(phone, taxId, email) {
  try {
    var r = await sb.rpc('check_signup_available', { p_phone: String(phone || ''), p_tax_id: String(taxId || ''), p_email: String(email || '') });
    if (r.error) return { phone_taken: false, tax_id_taken: false, email_blocked: false };
    var d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
    return { phone_taken: !!(d && d.phone_taken), tax_id_taken: !!(d && d.tax_id_taken), email_blocked: !!(d && d.email_blocked) };
  } catch (err) {
    return { phone_taken: false, tax_id_taken: false, email_blocked: false };
  }
}

// ----------------------------------------------------------------
// 기기 ID (브라우저마다 한 번 만든 랜덤 UUID) · 가입 기록
// ----------------------------------------------------------------
var DEVICE_ID_KEY = 'allabut_device_id';
function cncDeviceId() {
  try {
    var id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return '';
  }
}

// 가입 기록 (IP 는 서버가 요청 헤더에서, 처음 한 번만 저장돼요). 실패해도 조용히
async function cncRecordSignupMeta() {
  try {
    await sb.rpc('record_signup_meta', { p_device_id: cncDeviceId(), p_user_agent: String(navigator.userAgent || '').slice(0, 300) });
  } catch (err) { /* 010 실행 전 등 */ }
}

// 신규 가입 무료 크레딧 다시 시도 (로그인할 때) → { status: 'none'|'pending'|'granted'|..., credits } 또는 null
async function cncClaimSignupBonus() {
  try {
    var r = await sb.rpc('claim_signup_bonus');
    if (r.error) return null;
    var d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    return d || null;
  } catch (err) {
    return null;
  }
}

// ----------------------------------------------------------------
// 신규 가입 무료 크레딧 이벤트 안내 (로그인 전에도) → { active, credits, ends, banner, ... } 또는 { active: false }
// ----------------------------------------------------------------
var _campaignCache = null;
async function cncGetSignupCampaign(force) {
  if (_campaignCache && !force) return _campaignCache;
  try {
    var r = await sb.rpc('get_signup_campaign');
    var d = r.error ? null : r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    _campaignCache = d && typeof d === 'object' ? d : { active: false };
  } catch (err) {
    _campaignCache = { active: false };
  }
  return _campaignCache;
}

// 배너 글자 (지금 언어 → en → 기본 문구)
function cncCampaignBannerText(c, lang) {
  if (!c || !c.active) return '';
  var b = c.banner || {};
  var txt = (typeof cncLocalizedText === 'function') ? cncLocalizedText(b, lang) : (b[lang] || b.en || '');
  return txt || tf('campaign_default', { n: c.credits || 0 });
}

// 관리자 화면 상태: 'off' | 'scheduled' | 'running' | 'ended' (방콕 날짜 기준)
function cncCampaignStatus(s) {
  if (!s || !s.signup_bonus_enabled) return 'off';
  var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  if (s.signup_bonus_starts && today < s.signup_bonus_starts) return 'scheduled';
  if (s.signup_bonus_ends && today > s.signup_bonus_ends) return 'ended';
  return 'running';
}
