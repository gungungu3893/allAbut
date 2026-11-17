// ================================================================
// allAbut — 회원 필수 정보 · 정규화 · 가입 확인 · 신규 가입 무료 크레딧 이벤트 (로직만, 화면 코드 없음)
// ================================================================
// DB: sql/010_signup_identity_campaign.sql + sql/021_tax_invoices.sql (국가) — 정규화 규칙은 SQL 과 똑같아요 (한쪽을 바꾸면 다른 쪽도)
//   국가 country (ISO 2글자, 기본 'TH')                                               (SQL _norm_country)
//   전화   cncNormPhone(v, country)
//          TH  : 숫자만, 66 으로 시작하면 0 으로                                      (SQL _norm_phone(p, country))
//          해외 : '+' + 숫자 (00 으로 시작하면 00 을 뺌) / 형식: 입력이 + 또는 00 으로 시작 + 숫자 8~15자리 (SQL _valid_phone)
//   Tax ID cncNormTaxId(v, country) / cncValidTaxId(v, country)
//          TH  : 숫자만 13자리 + 태국 체크섬 — 앞 12자리 × 13..2 의 합 → (11 - 합 % 11) % 10 = 13번째 자리, 필수
//          해외 : 공백 없애고 대문자, 영문 · 숫자 · 하이픈 5~30자, 선택 ("Tax / VAT ID (optional)")
//   필수: 본명 · 전화 · 치과명 · 치과 주소 (+ 태국이면 Tax ID) → 하나라도 없으면 주문 불가 (DB 도 PROFILE_INCOMPLETE)
//   본명 · Tax ID · 국가는 처음 정해지면 잠겨요 → 바꾸려면 등록 정보 변경 요청 (관리자 승인)

// ----------------------------------------------------------------
// 국가
// ----------------------------------------------------------------
// 고르는 목록 (태국은 늘 맨 위, 나머지는 지금 언어 이름순으로 cncCountryOptions 가 정렬)
var COUNTRY_CODES = [
  'TH', 'KR', 'JP', 'CN', 'TW', 'HK', 'MO', 'VN', 'LA', 'KH', 'MM', 'MY', 'SG', 'ID', 'PH', 'BN', 'TL', 'IN', 'BD', 'LK', 'NP', 'PK', 'MN',
  'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IR', 'IQ', 'JO', 'IL', 'TR', 'EG', 'KZ', 'UZ',
  'AU', 'NZ', 'US', 'CA', 'MX', 'BR', 'AR', 'CL',
  'GB', 'IE', 'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'HU', 'RO', 'GR', 'RU', 'UA',
  'ZA', 'NG', 'KE'
];

function cncNormCountry(c) {
  var v = String(c == null ? '' : c).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : 'TH';
}

function cncIsThai(country) {
  return cncNormCountry(country) === 'TH';
}

// 국가 이름 (지금 언어로 — 브라우저 Intl.DisplayNames, 안 되면 코드 그대로)
function cncCountryName(code, lang) {
  code = cncNormCountry(code);
  try {
    if (window.Intl && Intl.DisplayNames) {
      var dn = new Intl.DisplayNames([lang || (typeof currentLang !== 'undefined' ? currentLang : 'en'), 'en'], { type: 'region' });
      return dn.of(code) || code;
    }
  } catch (e) { /* 무시 */ }
  return code;
}

// 고르는 목록 [{ code, name }] — 태국 맨 위, 나머지 이름순 (목록에 없는 지금 값도 넣어요)
function cncCountryOptions(current, lang) {
  var codes = COUNTRY_CODES.slice();
  var cur = current ? cncNormCountry(current) : '';
  if (cur && codes.indexOf(cur) === -1) codes.push(cur);
  var rest = codes.filter(function (c) { return c !== 'TH'; }).map(function (c) { return { code: c, name: cncCountryName(c, lang) }; });
  rest.sort(function (a, b) { return a.name.localeCompare(b.name, lang || undefined); });
  return [{ code: 'TH', name: cncCountryName('TH', lang) }].concat(rest);
}

// 프로필의 국가 (등록된 국가 → 고른 국가 → TH)
function cncProfileCountry(profile) {
  var p = profile || {};
  return cncNormCountry(p.reg_country || p.country || 'TH');
}

// ----------------------------------------------------------------
// 정규화 · 검사 (country 를 안 주면 태국)
// ----------------------------------------------------------------
function cncNormPhone(v, country) {
  var raw = String(v == null ? '' : v);
  var d = raw.replace(/[^0-9]/g, '');
  if (cncIsThai(country)) {
    if (/^66[0-9]{8,}$/.test(d)) d = '0' + d.slice(2);
    return d;
  }
  if (!d) return '';
  if (/^00/.test(raw.trim())) d = d.slice(2);
  return '+' + d;
}

function cncValidPhone(v, country) {
  if (cncIsThai(country)) return /^[0-9]{9,15}$/.test(cncNormPhone(v, 'TH'));
  var raw = String(v == null ? '' : v).trim();
  return (/^\+/.test(raw) || /^00/.test(raw)) && /^\+[0-9]{8,15}$/.test(cncNormPhone(v, country));
}

function cncNormTaxId(v, country) {
  if (cncIsThai(country)) return String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
}

function cncValidTaxId(v, country) {
  if (!cncIsThai(country)) return /^[A-Z0-9-]{5,30}$/.test(cncNormTaxId(v, country));
  var d = cncNormTaxId(v, 'TH');
  if (!/^[0-9]{13}$/.test(d)) return false;
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += Number(d.charAt(i)) * (13 - i);
  return (11 - sum % 11) % 10 === Number(d.charAt(12));
}

// 본명: 앞뒤 공백 · 겹친 공백 정리
function cncNormName(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

// 보기 좋게: 13자리 태국 Tax ID → 0-1055-56123-45-3 (해외 값은 그대로)
function cncFormatTaxId(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return d.length === 13 && /^[0-9\s-]+$/.test(String(v || ''))
    ? d.slice(0, 1) + '-' + d.slice(1, 5) + '-' + d.slice(5, 10) + '-' + d.slice(10, 12) + '-' + d.slice(12)
    : String(v || '');
}

// 지점 (태국 세금계산서): '' = 본점(สำนักงานใหญ่) / 5자리 = 지점(สาขาที่ 00001)
function cncNormBranch(v) {
  var s = String(v == null ? '' : v).replace(/\s+/g, '');
  return s === '00000' ? '' : s;
}
function cncValidBranch(v) {
  return /^([0-9]{5})?$/.test(cncNormBranch(v));
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

// 021 을 실행한 DB 인지 (프로필에 country 칸이 있는지) — 실행 전이면 국가 선택을 안 보여요
function cncHasCountryColumns(profile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, 'country');
}

// 비어 있거나 잘못된 필수 칸 목록 (예: ['tax_id', 'address']) — Tax ID 는 태국만 필수
function cncMissingProfileFields(profile) {
  var p = profile || {};
  var country = cncProfileCountry(p);
  return PROFILE_REQUIRED_FIELDS.filter(function (k) {
    if (k === 'phone') return !cncValidPhone(p.phone, country);
    if (k === 'tax_id') return cncIsThai(country) ? !cncValidTaxId(p.tax_id, 'TH') : false;
    return !cncNormName(p[k]);
  });
}

// 정보 입력 화면을 보여줘야 하는지 (010 실행 후 + 필수 칸이 빔)
function cncNeedsProfileInfo(profile) {
  return cncHasIdentityColumns(profile) && cncMissingProfileFields(profile).length > 0;
}

// 잠긴 칸인지 (본명 · 올바른 Tax ID · 등록된 국가는 처음 정해지면 잠겨요)
function cncIdentityLocked(profile, field) {
  var p = profile || {};
  if (field === 'full_name') return !!cncNormName(p.full_name);
  if (field === 'tax_id') return !!String(p.tax_id || '').trim() && cncValidTaxId(p.tax_id, cncProfileCountry(p));
  if (field === 'country') return !!p.reg_country;
  return false;
}

// 가입 폼·정보 입력 폼 검사 → { field: '에러 번역 키' }
//   fields: { full_name, phone, clinic_name, tax_id, address, country }
function cncValidateIdentity(fields) {
  var e = {};
  var country = cncNormCountry(fields.country || 'TH');
  if (!cncNormName(fields.full_name)) e.full_name = 'err_full_name_required';
  if (!String(fields.phone || '').trim()) e.phone = 'err_phone_required';
  else if (!cncValidPhone(fields.phone, country)) e.phone = cncIsThai(country) ? 'err_phone' : 'err_phone_intl';
  if (!cncNormName(fields.clinic_name)) e.clinic_name = 'err_clinic_required';
  if (cncIsThai(country)) {
    if (!String(fields.tax_id || '').trim()) e.tax_id = 'err_tax_id_required';
    else if (!cncValidTaxId(fields.tax_id, 'TH')) e.tax_id = 'err_tax_id_checksum';
  } else if (String(fields.tax_id || '').trim() && !cncValidTaxId(fields.tax_id, country)) {
    e.tax_id = 'err_tax_id_intl';
  }
  if (!cncNormName(fields.address)) e.address = 'err_address_required';
  return e;
}

// ----------------------------------------------------------------
// 가입 전 확인 (로그인 전) → { phone_taken, tax_id_taken, email_blocked } — 010 실행 전이면 모두 false
// ----------------------------------------------------------------
async function cncCheckSignupAvailable(phone, taxId, email, country) {
  var none = { phone_taken: false, tax_id_taken: false, email_blocked: false };
  var args = { p_phone: String(phone || ''), p_tax_id: String(taxId || ''), p_email: String(email || '') };
  if (country) args.p_country = cncNormCountry(country);
  try {
    var r = await sb.rpc('check_signup_available', args);
    if (r.error && args.p_country && /PGRST202|Could not find the function/i.test(String(r.error.code || '') + String(r.error.message || ''))) {
      delete args.p_country;   // 021 실행 전 (국가 인자 없는 예전 함수)
      r = await sb.rpc('check_signup_available', args);
    }
    if (r.error) return none;
    var d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
    return { phone_taken: !!(d && d.phone_taken), tax_id_taken: !!(d && d.tax_id_taken), email_blocked: !!(d && d.email_blocked) };
  } catch (err) {
    return none;
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
