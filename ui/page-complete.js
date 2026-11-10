// ===== 필수 정보 입력 #/complete =====
// sql/010 실행 후, 본명 · 전화 · 치과명 · 치과 Tax ID · 치과 주소 중 하나라도 비어 있으면
// 로그인 직후 이 화면만 열려요 (router.js 가 다른 페이지로 못 가게 막아요. 법적 문서 · 문의 · 회사소개는 열림).
//   - 이미 채워진 본명 · 올바른 Tax ID 는 잠겨 있어서 읽기 전용 (바꾸려면 Profile → 등록 정보 변경 요청)
//   - 저장은 cncSaveProfile → 서버 트리거가 정규화 · 형식 · 중복을 다시 검사 (PHONE_TAKEN 등은 칸 아래 빨간 글씨)
//   - 다 채우면 APP.needsInfo = false → 홈으로

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

  draw: function () {
    if (!this.main) return;
    var p = APP.profile || {};
    var vals = this.values || {
      full_name: p.full_name || '', phone: p.phone || '', clinic_name: p.clinic_name || '',
      tax_id: p.tax_id || '', address: p.address || ''
    };
    var e = this.errors;
    var missing = cncMissingProfileFields(p);

    function field(id, labelKey, opts) {
      opts = opts || {};
      var locked = cncIdentityLocked(p, id);
      var html = '<div class="field' + (opts.span ? ' span-2' : '') + (missing.indexOf(id) !== -1 ? ' field-missing' : '') + '">' +
        '<label class="field-label" for="pc-' + id + '">' + escHtml(t(labelKey)) + ' <span class="required" aria-hidden="true">*</span></label>';
      if (locked) {
        html += '<p class="readonly-value" id="pc-' + id + '">' + escHtml(id === 'tax_id' ? cncFormatTaxId(p[id]) : p[id]) + '</p>' +
          '<p class="field-help"><span aria-hidden="true">🔒</span> ' + escHtml(t('identity_locked_note')) + '</p>';
      } else if (opts.textarea) {
        html += '<textarea class="input textarea' + (e[id] ? ' invalid' : '') + '" id="pc-' + id + '" rows="3" maxlength="300">' + escHtml(vals[id]) + '</textarea>';
      } else {
        html += '<input class="input' + (e[id] ? ' invalid' : '') + '" id="pc-' + id + '" type="' + (opts.type || 'text') + '"' +
          (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + ' maxlength="' + (opts.max || 200) + '" value="' + escHtml(vals[id]) + '">';
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
            field('phone', 'phone_label', { type: 'tel', inputmode: 'tel', max: 30 }) +
            field('tax_id', 'clinic_tax_id_label', { inputmode: 'numeric', max: 20, help: 'tax_id_help' }) +
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

    var first = this.main.querySelector('.invalid') || this.main.querySelector('.field-missing input, .field-missing textarea');
    if (first) first.focus({ preventScroll: true });
  },

  save: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var p = APP.profile || {};
    var main = this.main;
    var vals = {};
    ['full_name', 'phone', 'clinic_name', 'tax_id', 'address'].forEach(function (k) {
      var el = main.querySelector('#pc-' + k);
      // 잠긴 칸(읽기 전용)은 지금 프로필 값 그대로
      vals[k] = (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) ? el.value.trim() : String(p[k] || '');
    });
    this.values = vals;
    this.errors = cncValidateIdentity(vals);
    if (Object.keys(this.errors).length) { this.draw(); return; }

    // 잠긴 칸은 보내지 않아요 (서버도 바꾸지 못하게 막아요)
    var fields = { phone: vals.phone, clinic_name: cncNormName(vals.clinic_name), address: vals.address };
    if (!cncIdentityLocked(p, 'full_name')) fields.full_name = cncNormName(vals.full_name);
    if (!cncIdentityLocked(p, 'tax_id')) fields.tax_id = cncNormTaxId(vals.tax_id);

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
        this.errors[fieldOf[code]] = uiErrorMessageKey(code);
        this.draw();
      } else {
        this.draw();
        uiToast(uiErrorMessage(err), 'error');
      }
    }
  }
};

// 에러 코드 → 번역 키 (칸 아래 글씨용)
function uiErrorMessageKey(code) {
  return {
    PHONE_TAKEN: 'err_phone_taken', PHONE_INVALID: 'err_phone',
    TAX_ID_TAKEN: 'err_tax_id_taken', TAX_ID_INVALID: 'err_tax_id_checksum'
  }[code] || 'err_unknown';
}
