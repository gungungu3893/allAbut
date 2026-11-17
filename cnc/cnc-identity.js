// ================================================================
// allAbut — 회원 필수 정보 · 정규화 · 가입 확인 · 신규 가입 무료 크레딧 이벤트 (로직만, 화면 코드 없음)
// ================================================================
// DB: sql/010_signup_identity_campaign.sql + sql/021_tax_invoices.sql (국가) — 정규화 규칙은 SQL 과 똑같아요 (한쪽을 바꾸면 다른 쪽도)
//   국가 country (ISO 2글자, 기본 'TH')                                               (SQL _norm_country)
//   전화   cncNormPhone(v, country)   — 화면은 "국가번호 + 뒷번호" 두 칸 (ui/layout.js uiPhoneField) → cncComposePhone 으로 합쳐서 넘겨요
//          TH  : 태국 번호(+66 · 0066 · 66 · 0…) → 0 으로 시작하는 국내 형식 0812345678     (SQL _norm_phone(p, country), sql/022)
//                해외 번호(+82 … · 0082 …)     → '+' + 숫자 국제 형식 +821012345678 (sql/022 — 태국 치과가 해외 번호를 쓸 때)
//          해외 : '+' + 숫자 (00 으로 시작하면 00 을 뺌, +66 도 그대로) / 형식: 입력이 + 또는 00 으로 시작 + 숫자 8~15자리 (SQL _valid_phone)
//   Tax ID cncNormTaxId(v, country) / cncValidTaxId(v, country)
//          TH  : 숫자만 13자리 + 태국 체크섬 — 앞 12자리 × 13..2 의 합 → (11 - 합 % 11) % 10 = 13번째 자리, 필수
//          해외 : 공백 없애고 대문자, 영문 · 숫자 · 하이픈 5~30자, 선택 ("Tax / VAT ID (optional)")
//   필수: 본명 · 전화 · 치과명 · 치과 주소 (+ 태국이면 Tax ID) → 하나라도 없으면 주문 불가 (DB 도 PROFILE_INCOMPLETE)
//   본명 · Tax ID · 국가는 처음 정해지면 잠겨요 → 바꾸려면 등록 정보 변경 요청 (관리자 승인)

// ----------------------------------------------------------------
// 국가 · 국가번호 (이 표 하나에서 관리해요 — 국가 선택 목록 · 전화번호 국가번호 칸이 같이 써요)
// ----------------------------------------------------------------
// ISO 2글자 → 국제 전화 국가번호 (+ 뒤 숫자). 북미(NANP) 나라는 모두 '1' 로 둬요 (지역번호는 뒷번호에)
var COUNTRY_DIAL = {
  AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244', AR: '54', AS: '1', AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994',
  BA: '387', BB: '1', BD: '880', BE: '32', BF: '226', BG: '359', BH: '973', BI: '257', BJ: '229', BL: '590', BM: '1', BN: '673', BO: '591', BQ: '599',
  BR: '55', BS: '1', BT: '975', BW: '267', BY: '375', BZ: '501',
  CA: '1', CC: '61', CD: '243', CF: '236', CG: '242', CH: '41', CI: '225', CK: '682', CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53',
  CV: '238', CW: '599', CX: '61', CY: '357', CZ: '420',
  DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213',
  EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251',
  FI: '358', FJ: '679', FK: '500', FM: '691', FO: '298', FR: '33',
  GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233', GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30',
  GT: '502', GU: '1', GW: '245', GY: '592',
  HK: '852', HN: '504', HR: '385', HT: '509', HU: '36',
  ID: '62', IE: '353', IL: '972', IM: '44', IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354', IT: '39',
  JE: '44', JM: '1', JO: '962', JP: '81',
  KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1', KP: '850', KR: '82', KW: '965', KY: '1', KZ: '7',
  LA: '856', LB: '961', LC: '1', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370', LU: '352', LV: '371', LY: '218',
  MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389', ML: '223', MM: '95', MN: '976', MO: '853', MP: '1',
  MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230', MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258',
  NA: '264', NC: '687', NE: '227', NF: '672', NG: '234', NI: '505', NL: '31', NO: '47', NP: '977', NR: '674', NU: '683', NZ: '64',
  OM: '968',
  PA: '507', PE: '51', PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PR: '1', PS: '970', PT: '351', PW: '680', PY: '595',
  QA: '974',
  RE: '262', RO: '40', RS: '381', RU: '7', RW: '250',
  SA: '966', SB: '677', SC: '248', SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47', SK: '421', SL: '232', SM: '378', SN: '221',
  SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1', SY: '963', SZ: '268',
  TC: '1', TD: '235', TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670', TM: '993', TN: '216', TO: '676', TR: '90', TT: '1', TV: '688', TW: '886', TZ: '255',
  UA: '380', UG: '256', US: '1', UY: '598', UZ: '998',
  VA: '39', VC: '1', VE: '58', VG: '1', VI: '1', VN: '84', VU: '678',
  WF: '681', WS: '685',
  XK: '383',
  YE: '967', YT: '262',
  ZA: '27', ZM: '260', ZW: '263'
};
// 같은 국가번호를 여러 나라가 쓸 때, 붙여넣은 번호(+1 …)를 어느 나라로 볼지 (치과 국가가 그 번호면 치과 국가가 먼저)
var DIAL_PRIMARY = { '1': 'US', '7': 'RU', '44': 'GB', '61': 'AU', '47': 'NO', '39': 'IT', '212': 'MA', '262': 'RE', '590': 'GP', '599': 'CW', '358': 'FI' };

// 고르는 목록 (태국은 늘 맨 위, 나머지는 지금 언어 이름순으로 cncCountryOptions 가 정렬)
var COUNTRY_CODES = ['TH'].concat(Object.keys(COUNTRY_DIAL).filter(function (c) { return c !== 'TH'; }));

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

// 고르는 목록 [{ code, name, dial, label }] — 태국 맨 위, 나머지 이름순 (목록에 없는 지금 값도 넣어요)
//   label = "Thailand (+66)" — 국가 선택 · 국가번호 선택 목록에 그대로 써요
var _countryOptCache = {};
function cncCountryOptions(current, lang) {
  var key = lang || 'en';
  if (!_countryOptCache[key]) {
    var rest = COUNTRY_CODES.filter(function (c) { return c !== 'TH'; }).map(function (c) { return cncCountryOption(c, lang); });
    rest.sort(function (a, b) { return a.name.localeCompare(b.name, lang || undefined); });
    _countryOptCache[key] = [cncCountryOption('TH', lang)].concat(rest);
  }
  var list = _countryOptCache[key];
  var cur = current ? cncNormCountry(current) : '';
  if (cur && !COUNTRY_DIAL[cur]) list = list.concat([cncCountryOption(cur, lang)]);
  return list;
}
function cncCountryOption(code, lang) {
  var name = cncCountryName(code, lang);
  var dial = cncDialCode(code);
  return { code: code, name: name, dial: dial, label: dial ? name + ' (+' + dial + ')' : name };
}

// 국가번호 ('TH' → '66', 모르면 '')
function cncDialCode(country) {
  return COUNTRY_DIAL[cncNormCountry(country)] || '';
}

// 국기 그림 글자 ('TH' → 🇹🇭). 국기를 못 그리는 컴퓨터(Windows)는 글자 두 개로 보여요
function cncCountryFlag(country) {
  var c = cncNormCountry(country);
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65);
}

// 국가번호 → 나라 (prefer 가 그 번호를 쓰면 prefer, 아니면 대표 나라 → 표에서 처음 나온 나라)
function cncDialCountry(dial, prefer) {
  dial = String(dial || '');
  if (!dial) return '';
  if (prefer && cncDialCode(prefer) === dial) return cncNormCountry(prefer);
  if (DIAL_PRIMARY[dial]) return DIAL_PRIMARY[dial];
  for (var c in COUNTRY_DIAL) if (COUNTRY_DIAL[c] === dial) return c;
  return '';
}

// ----------------------------------------------------------------
// 전화번호 칸 "국가번호 + 뒷번호" (화면 ui/layout.js uiPhoneField 가 써요)
// ----------------------------------------------------------------
// 뒷번호 정리: 숫자만 + 맨 앞의 0(국내 접두) 빼기 — 이탈리아(+39)만 0 을 남겨요 (국제 번호에도 0 이 들어가서)
function cncPhoneRest(rest, dial) {
  var d = String(rest == null ? '' : rest).replace(/[^0-9]/g, '');
  if (dial !== '39') d = d.replace(/^0+/, '');
  return d;
}

// 숫자 문자열 앞에서 국가번호 찾기 (긴 것부터 3 → 2 → 1자리) → { country, rest } 또는 null
function _cncMatchDial(digits, prefer) {
  for (var n = 3; n >= 1; n--) {
    var dial = digits.slice(0, n);
    var c = cncDialCountry(dial, prefer);
    if (c && digits.length > n) return { country: c, rest: digits.slice(n) };
  }
  return null;
}

// 붙여넣거나 입력한 글자 정리: '+66812345678' · '0066…' → { country: 'TH', rest: '812345678' }
//   국가번호가 없으면 { country: null, rest } — '0812345678' 은 앞의 0 만 빼요 (지금 고른 국가번호 그대로)
//   지금 국가번호가 66 인데 '66812345678' 처럼 + 없이 66 으로 시작하는 태국 번호도 정리해요
function cncParsePhoneInput(text, currentCountry) {
  var t = String(text == null ? '' : text).trim();
  var d = t.replace(/[^0-9]/g, '');
  var curDial = cncDialCode(currentCountry);
  if (/^\+/.test(t) || /^00/.test(t)) {
    var digits = /^00/.test(t) ? d.slice(2) : d;
    var m = _cncMatchDial(digits, currentCountry);
    if (m) return { country: m.country, rest: cncPhoneRest(m.rest, cncDialCode(m.country)) };
    return { country: null, rest: cncPhoneRest(digits, curDial) };
  }
  if (curDial === '66' && /^66[0-9]{8,}$/.test(d)) return { country: 'TH', rest: cncPhoneRest(d.slice(2), '66') };
  return { country: null, rest: cncPhoneRest(d, curDial) };
}

// 저장된 번호 → 화면 두 칸 { country, rest }
//   '+821012345678' → KR · '1012345678' / 태국 국내 형식 '0812345678' → TH · '812345678' / + 없는 예전 값 → 치과 국가 + 앞의 0 뺀 숫자
function cncSplitPhone(stored, clinicCountry) {
  var v = String(stored == null ? '' : stored).trim();
  var clinic = cncNormCountry(clinicCountry || 'TH');
  if (!v) return { country: clinic, rest: '' };
  var p = cncParsePhoneInput(v, clinic);
  if (p.country) return p;
  if (/^\+|^00/.test(v)) return { country: clinic, rest: p.rest };
  // + 없는 숫자: 태국 국내 형식이면 TH, 아니면 치과 국가
  var d = v.replace(/[^0-9]/g, '');
  if (/^0[0-9]{8,9}$/.test(d) && clinic === 'TH') return { country: 'TH', rest: cncPhoneRest(d, '66') };
  return { country: clinic, rest: cncPhoneRest(d, cncDialCode(clinic)) };
}

// 두 칸 → '+66812345678' (뒷번호가 비면 '') — 저장 전에 cncNormPhone(…, 치과 국가) 로 정규화해요
function cncComposePhone(country, rest) {
  var dial = cncDialCode(country);
  var r = cncPhoneRest(rest, dial);
  if (!r) return '';
  return dial ? '+' + dial + r : r;
}

// 프로필의 국가 (등록된 국가 → 고른 국가 → TH)
function cncProfileCountry(profile) {
  var p = profile || {};
  return cncNormCountry(p.reg_country || p.country || 'TH');
}

// ----------------------------------------------------------------
// 정규화 · 검사 (country 를 안 주면 태국)
// ----------------------------------------------------------------
// 예전 태국 국내 규칙 (SQL 1인자 _norm_phone(p), sql/010): 숫자만, 66 + 8자리 이상이면 0 으로
function _cncNormPhoneTh(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (/^66[0-9]{8,}$/.test(d)) d = '0' + d.slice(2);
  return d;
}

function cncNormPhone(v, country) {
  var raw = String(v == null ? '' : v);
  var t = raw.trim();
  var d = raw.replace(/[^0-9]/g, '');
  var intl = /^\+/.test(t) || /^00/.test(t);
  var dd = /^00/.test(t) ? d.slice(2) : d;
  if (cncIsThai(country)) {
    // sql/022: + / 00 으로 시작하면 태국 번호(66…)는 국내 형식, 해외 번호는 국제 형식 그대로
    if (intl && dd) return /^66/.test(dd) ? _cncNormPhoneTh(dd) : '+' + dd;
    return _cncNormPhoneTh(raw);
  }
  if (!d) return '';
  return '+' + dd;
}

function cncValidPhone(v, country) {
  var n = cncNormPhone(v, country);
  if (cncIsThai(country)) return n.charAt(0) === '+' ? /^\+[0-9]{8,15}$/.test(n) : /^[0-9]{9,15}$/.test(n);
  var raw = String(v == null ? '' : v).trim();
  return (/^\+/.test(raw) || /^00/.test(raw)) && /^\+[0-9]{8,15}$/.test(n);
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
  if (profile && profile.account_type === 'staff') return false;   // 직원 계정은 치과 정보가 없어요 (sql/023)
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
