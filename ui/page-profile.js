// ===== 내 정보 #/profile =====
// - 닉네임·이메일(읽기 전용), 치과 정보(Clinic name, Address, Phone, Tax ID, LINE ID), 언어 → 저장
// - 크레딧 잔액 + 크레딧 이력 표

var PageProfile = {
  main: null,
  history: null,
  historyError: false,
  errors: {},
  saving: false,
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.history = null;
    this.historyError = false;
    this.errors = {};
    this.draw();
    this.loadHistory();
    this.onBalance = this.drawCredits.bind(this);
    window.addEventListener('balancechange', this.onBalance);
    refreshBalance();
  },

  rerender: function () {
    this.draw();
  },

  leave: function () {
    this.loadToken++;
    if (this.onBalance) window.removeEventListener('balancechange', this.onBalance);
  },

  loadHistory: async function () {
    var token = ++this.loadToken;
    this.historyError = false;
    try {
      var rows = await cncCreditHistory(50);
      if (token !== this.loadToken) return;
      this.history = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.historyError = true;
    }
    this.drawCredits();
  },

  draw: function () {
    if (!this.main) return;
    var p = APP.profile || {};
    var e = this.errors;

    function readOnly(labelKey, value) {
      return '<div class="field"><span class="field-label">' + escHtml(t(labelKey)) + '</span>' +
        '<p class="readonly-value">' + escHtml(value || '—') + '</p></div>';
    }
    function input(id, labelKey, value, opts) {
      opts = opts || {};
      return '<div class="field' + (opts.span ? ' span-2' : '') + '">' +
        '<label class="field-label" for="p-' + id + '">' + escHtml(t(labelKey)) +
          (opts.required ? '' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
        '<input class="input' + (e[id] ? ' invalid' : '') + '" id="p-' + id + '" type="' + (opts.type || 'text') + '" maxlength="200" value="' + escHtml(value || '') + '">' +
        (opts.help ? '<p class="field-help">' + escHtml(t(opts.help)) + '</p>' : '') +
        uiFieldError(e[id]) +
        '</div>';
    }

    this.main.innerHTML =
      '<div class="page page-profile">' +
        '<h1 class="page-title">' + escHtml(t('nav_profile')) + '</h1>' +
        '<div class="profile-grid">' +
          '<section class="card">' +
            '<h2 class="card-title">' + escHtml(t('profile_info_title')) + '</h2>' +
            '<p class="card-desc">' + escHtml(t('profile_info_desc')) + '</p>' +
            '<form class="form-grid two" onsubmit="PageProfile.save(event)" novalidate>' +
              readOnly('nickname_label', p.nickname) +
              readOnly('email_label', APP.user && APP.user.email) +
              input('clinic_name', 'clinic_name', p.clinic_name, { span: true }) +
              input('address', 'address_label', p.address, { span: true }) +
              input('phone', 'phone_label', p.phone, { type: 'tel' }) +
              input('tax_id', 'tax_id_label', p.tax_id) +
              input('line_user_id', 'line_id_label', p.line_user_id) +
              '<div class="field">' +
                '<label class="field-label" for="p-lang">' + escHtml(t('language')) + '</label>' +
                '<select class="input" id="p-lang">' + LANGUAGES.map(function (l) {
                  return '<option value="' + l.code + '"' + (l.code === currentLang ? ' selected' : '') + '>' + escHtml(l.name) + '</option>';
                }).join('') + '</select>' +
              '</div>' +
              '<div class="span-2 form-actions">' +
                '<button type="submit" class="btn btn-primary btn-lg" id="profile-save"' + (this.saving ? ' disabled' : '') + '>' +
                  escHtml(this.saving ? t('saving') : t('pe_save')) + '</button>' +
              '</div>' +
            '</form>' +
          '</section>' +
          '<section class="card" id="profile-credits"></section>' +
        '</div>' +
      '</div>';
    this.drawCredits();
  },

  drawCredits: function () {
    var box = document.getElementById('profile-credits');
    if (!box) return;
    var html = '<h2 class="card-title">' + escHtml(t('credit_balance')) + '</h2>' +
      '<p class="big-number mono">' + (APP.balance != null ? formatNumber(APP.balance) : '—') + ' <span class="big-number-unit">' + escHtml(t('credit_unit')) + '</span></p>' +
      '<p class="card-desc">' + escHtml(t('credit_rule')) + ' · ' + escHtml(t('credit_charge_help')) + '</p>' +
      '<h3 class="detail-title">' + escHtml(t('credit_history_title')) + '</h3>';

    if (this.historyError) {
      html += '<p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('credit_load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageProfile.loadHistory()">' + escHtml(t('btn_retry')) + '</button>';
    } else if (this.history === null) {
      html += uiLoading();
    } else if (!this.history.length) {
      html += '<p class="empty-text">' + escHtml(t('credit_no_history')) + '</p>';
    } else {
      html += '<div class="table-wrap"><table class="table credit-table"><thead><tr>' +
        '<th>' + escHtml(t('col_date')) + '</th><th>' + escHtml(t('col_type')) + '</th><th>' + escHtml(t('col_amount')) + '</th>' +
        '<th>' + escHtml(t('col_description')) + '</th><th>' + escHtml(t('order_number')) + '</th></tr></thead><tbody>' +
        this.history.map(function (h) {
          var amount = Number(h.amount || 0);
          return '<tr>' +
            '<td class="mono nowrap">' + escHtml(formatDate(h.created_at)) + '</td>' +
            '<td><span class="badge credit-' + escHtml(h.type) + '">' + escHtml(t('credit_type_' + h.type)) + '</span></td>' +
            '<td class="mono nowrap ' + (amount >= 0 ? 'plus' : 'minus') + '">' + (amount > 0 ? '+' : '') + formatNumber(amount) + '</td>' +
            '<td>' + escHtml(h.description || '') + '</td>' +
            '<td class="mono nowrap">' + escHtml(h.order_id || '—') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
  },

  save: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var v = function (id) { return document.getElementById('p-' + id).value.trim(); };
    var fields = {
      clinic_name: v('clinic_name'),
      address: v('address'),
      phone: v('phone'),
      tax_id: v('tax_id'),
      line_user_id: v('line_user_id'),
      lang: document.getElementById('p-lang').value
    };
    this.errors = {};
    if (fields.tax_id && !/^[0-9A-Za-z\- ]{5,20}$/.test(fields.tax_id)) this.errors.tax_id = 'err_tax_id';
    if (fields.phone && !/^[0-9+\-() ]{6,20}$/.test(fields.phone)) this.errors.phone = 'err_phone';
    if (Object.keys(this.errors).length) {
      this.keepValues(fields);
      return;
    }

    this.saving = true;
    this.keepValues(fields);
    try {
      await cncSaveProfile(fields);
      this.saving = false;
      uiToast(t('profile_saved'), 'success');
      if (fields.lang !== currentLang) setLang(fields.lang);   // 화면 전체가 새 언어로 다시 그려져요
      else this.draw();
    } catch (err) {
      console.error(err);
      this.saving = false;
      this.keepValues(fields);
      uiToast(uiErrorMessage(err), 'error');
    }
  },

  // 다시 그려도 입력하던 값이 남도록
  keepValues: function (fields) {
    var backup = APP.profile;
    APP.profile = Object.assign({}, backup || {}, fields);
    this.draw();
    APP.profile = backup;
    var first = document.querySelector('.page-profile .invalid');
    if (first) first.focus();
  }
};
