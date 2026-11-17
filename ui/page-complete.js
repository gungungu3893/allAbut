// ===== 필수 정보 입력 #/complete =====
// sql/010 실행 후, 본명 · 전화 · 치과명 · 치과 Tax ID · 치과 주소 중 하나라도 비어 있으면
// 로그인 직후 이 화면만 열려요 (router.js 가 다른 페이지로 못 가게 막아요. 법적 문서 · 문의 · 회사소개는 열림).
//   - 이미 채워진 본명 · 올바른 Tax ID 는 잠겨 있어서 읽기 전용 (바꾸려면 Profile → 등록 정보 변경 요청)
//   - 저장은 cncSaveProfile → 서버 트리거가 정규화 · 형식 · 중복을 다시 검사 (PHONE_TAKEN 등은 칸 아래 빨간 글씨)
//   - 다 채우면 APP.needsInfo = false → 홈으로
// sql/021: "치과 소재 국가" 선택 (기본 Thailand, 태국 맨 위)
//   - 태국: Tax ID 13자리 필수
//   - 그 밖: Tax / VAT ID 선택 → 충전 승인 때 세금계산서 대신 영수증(Receipt)
// 전화번호 = 공통 부품 uiPhoneField (국가번호 + 뒷번호, 국가번호는 고른 국가를 따라가요 · 저장은 cncNormPhone 으로 정규화)

var PageComplete = {
  main: null,
  errors: {},
  values: null,   // 저장에 실패해도 입력하던 값이 남도록
  saving: false,

  render: function (main) {
    this.main = main;
    this.errors = {};
    this.values = null;
    this.draw();
  },

  rerender: function (main) {
    if (main) this.main = main;
    this.draw();
  },

  // 지금 고른 국가 (잠겨 있으면 프로필 값)
  currentCountry: function () {
    var p = APP.profile || {};
    if (cncIdentityLocked(p, 'country')) return cncProfileCountry(p);
    if (this.values && this.values.country) return cncNormCountry(this.values.country);
    return cncNormCountry(p.country || 'TH');
  },

  // 국가를 바꾸면 입력하던 값을 남긴 채 라벨 · 규칙만 다시 그려요
  onCountry: function () {
    this.values = this.collect();
    this.errors = {};
    this.draw();
  },

  collect: function () {
    var p = APP.profile || {};
    var main = this.main;
    var vals = {};
    ['full_name', 'clinic_name', 'tax_id', 'address', 'country'].forEach(function (k) {
      var el = main.querySelector('#pc-' + k);
      // 잠긴 칸(읽기 전용)은 지금 프로필 값 그대로
      vals[k] = (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) ? el.value.trim() : String(p[k] || '');
    });
    if (cncIdentityLocked(p, 'country')) vals.country = cncProfileCountry(p);
    vals.country = cncNormCountry(vals.country || 'TH');
    // 전화: 검사용 '+66812345678' + 다시 그릴 때 쓸 칸 상태
    vals.phone = uiPhoneRaw('pc-phone');
    vals.phoneState = uiPhoneState('pc-phone');
    return vals;
  },

  draw: function () {
    if (!this.main) return;
    var p = APP.profile || {};
    var country = this.currentCountry();
    var thai = cncIsThai(country);
    var vals = this.values || {
      full_name: p.full_name || '', phone: p.phone || '', clinic_name: p.clinic_name || '',
      tax_id: p.tax_id || '', address: p.address || '', country: country
    };
    var e = this.errors;
    var missing = cncMissingProfileFields(Object.assign({}, p, { country: country }));

    function field(id, labelKey, opts) {
      opts = opts || {};
      var locked = cncIdentityLocked(p, id);
      var required = opts.optional ? '' : ' <span class="required" aria-hidden="true">*</span>';
      var html = '<div class="field' + (opts.span ? ' span-2' : '') + (missing.indexOf(id) !== -1 ? ' field-missing' : '') + '">' +
        '<label class="field-label" for="pc-' + id + '">' + escHtml(t(labelKey)) + required + '</label>';
      if (opts.phone && !locked) {
        // 국가번호 + 뒷번호 (ui/layout.js)
        html += uiPhoneField({ id: 'pc-phone', value: vals.phone, country: country, invalid: !!e.phone, state: vals.phoneState });
      } else if (locked) {
        var shown = id === 'tax_id' ? cncFormatTaxId(p[id]) : (id === 'country' ? cncCountryName(cncProfileCountry(p), currentLang) : p[id]);
        html += '<p class="readonly-value" id="pc-' + id + '">' + escHtml(shown) + '</p>' +
          '<p class="field-help"><span aria-hidden="true">🔒</span> ' + escHtml(t('identity_locked_note')) + '</p>';
      } else if (opts.select) {
        html += '<select class="input' + (e[id] ? ' invalid' : '') + '" id="pc-' + id + '" onchange="PageComplete.onCountry()">' +
          cncCountryOptions(vals[id] || 'TH', currentLang).map(function (c) {
            return '<option value="' + c.code + '"' + (c.code === (vals[id] || 'TH') ? ' selected' : '') + '>' + escHtml(c.label) + '</option>';
          }).join('') + '</select>';
      } else if (opts.textarea) {
        html += '<textarea class="input textarea' + (e[id] ? ' invalid' : '') + '" id="pc-' + id + '" rows="3" maxlength="300">' + escHtml(vals[id]) + '</textarea>';
      } else {
        html += '<input class="input' + (e[id] ? ' invalid' : '') + '" id="pc-' + id + '" type="' + (opts.type || 'text') + '"' +
          (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
          (opts.placeholder ? ' placeholder="' + escHtml(opts.placeholder) + '"' : '') +
          ' maxlength="' + (opts.max || 200) + '" value="' + escHtml(vals[id]) + '">';
      }
      if (!locked && opts.help) html += '<p class="field-help">' + escHtml(t(opts.help)) + '</p>';
      html += uiFieldError(e[id]) + '</div>';
      return html;
    }

    this.main.innerHTML =
      '<div class="page page-complete">' +
        '<h1 class="page-title">' + escHtml(t('complete_title')) + '</h1>' +
        '<section class="card complete-card">' +
          '<p class="complete-desc"><span aria-hidden="true">ℹ</span> ' + escHtml(t('complete_desc')) + '</p>' +
          '<form class="form-grid two" onsubmit="PageComplete.save(event)" novalidate>' +
            field('full_name', 'full_name_label', { span: true, help: 'full_name_help' }) +
            (cncHasCountryColumns(p) ? field('country', 'country_label', { span: true, select: true, help: 'country_help' }) : '') +
            field('phone', 'phone_label', { phone: true }) +
            (thai
              ? field('tax_id', 'clinic_tax_id_label', { inputmode: 'numeric', max: 20, help: 'tax_id_help' })
              : field('tax_id', 'tax_vat_optional_label', { max: 30, optional: true, help: 'tax_vat_optional_help' })) +
            field('clinic_name', 'clinic_name', { span: true }) +
            field('address', 'clinic_address_label', { span: true, textarea: true }) +
            '<div class="span-2 form-actions">' +
              '<button type="submit" class="btn btn-primary btn-lg" id="complete-save"' + (this.saving ? ' disabled' : '') + '>' +
                escHtml(this.saving ? t('saving') : t('complete_save')) + '</button>' +
            '</div>' +
          '</form>' +
          '<p class="muted complete-help">' + escHtml(t('complete_help')) + ' <a href="#/contact">' + escHtml(t('contact_title')) + '</a></p>' +
        '</section>' +
      '</div>';

    var first = this.main.querySelector('input.invalid, textarea.invalid, select.invalid') || this.main.querySelector('.field-missing input, .field-missing textarea');
    if (first) first.focus({ preventScroll: true });
  },

  save: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var p = APP.profile || {};
    var vals = this.collect();
    this.values = vals;
    this.errors = cncValidateIdentity(vals);
    if (Object.keys(this.errors).length) { this.draw(); return; }

    // 잠긴 칸은 보내지 않아요 (서버도 바꾸지 못하게 막아요)
    var fields = { phone: cncNormPhone(vals.phone, vals.country), clinic_name: cncNormName(vals.clinic_name), address: vals.address };
    if (!cncIdentityLocked(p, 'full_name')) fields.full_name = cncNormName(vals.full_name);
    if (!cncIdentityLocked(p, 'tax_id')) fields.tax_id = cncNormTaxId(vals.tax_id, vals.country);
    if (!cncIdentityLocked(p, 'country') && cncHasCountryColumns(p)) fields.country = vals.country;

    this.saving = true;
    this.draw();
    try {
      await cncSaveProfile(fields);
      this.saving = false;
      APP.needsInfo = cncNeedsProfileInfo(APP.profile);
      if (APP.needsInfo) { this.values = null; this.draw(); return; }
      uiToast(t('complete_done'), 'success');
      // 정보가 다 채워지면 등록된 치과 정보가 잠기고, 신규 가입 무료 크레딧 이벤트 조건을 다시 확인해요
      cncClaimSignupBonus().then(function () { refreshBalance(); });
      navigate('home');
    } catch (err) {
      console.error(err);
      this.saving = false;
      var code = cncErrorCode(err);
      var fieldOf = { PHONE_TAKEN: 'phone', PHONE_INVALID: 'phone', TAX_ID_TAKEN: 'tax_id', TAX_ID_INVALID: 'tax_id' };
      if (fieldOf[code]) {
        this.errors = {};
        this.errors[fieldOf[code]] = uiErrorMessageKey(code, vals.country);
        this.draw();
      } else {
        this.draw();
        uiToast(uiErrorMessage(err), 'error');
      }
    }
  }
};

// 에러 코드 → 번역 키 (칸 아래 글씨용). 태국이 아니면 형식 안내가 달라요 (sql/021)
function uiErrorMessageKey(code, country) {
  var thai = cncIsThai(country || 'TH');
  return {
    PHONE_TAKEN: 'err_phone_taken', PHONE_INVALID: thai ? 'err_phone' : 'err_phone_intl',
    TAX_ID_TAKEN: 'err_tax_id_taken', TAX_ID_INVALID: thai ? 'err_tax_id_checksum' : 'err_tax_id_intl'
  }[code] || 'err_unknown';
}
