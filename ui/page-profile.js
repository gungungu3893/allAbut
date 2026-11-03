// ===== 내 정보 #/profile =====
// - 닉네임·이메일(읽기 전용), 치과 정보(Clinic name, Address, Phone, Tax ID), 언어 → 저장
// - 크레딧 잔액 + 크레딧 이력 표
// - LINE 알림 연결 (친구추가 → 연결 코드 보내기 → 연결 완료 / 연결 해제)

var PageProfile = {
  main: null,
  history: null,
  historyError: false,
  errors: {},
  saving: false,
  loadToken: 0,
  line: { code: null, loading: false, error: null, checking: false, busy: false },
  scrollToLine: false,   // 홈의 "연결하기" 로 들어오면 LINE 섹션으로 내려가요

  render: function (main) {
    this.main = main;
    this.history = null;
    this.historyError = false;
    this.errors = {};
    this.line = { code: null, loading: false, error: null, checking: false, busy: false };
    this.draw();
    this.loadHistory();
    this.loadLine();
    if (this.scrollToLine) {
      this.scrollToLine = false;
      var box = document.getElementById('profile-line');
      if (box) setTimeout(function () { box.scrollIntoView({ block: 'start' }); }, 50);
    }
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
        '<section class="card line-card" id="profile-line"></section>' +
      '</div>';
    this.drawCredits();
    this.drawLine();
  },

  // ================================================================
  // LINE 알림 연결
  // ================================================================
  loadLine: async function () {
    if (cncIsLineLinked(APP.profile)) { this.drawLine(); return; }
    var st = this.line;
    st.loading = true;
    st.error = null;
    this.drawLine();
    try {
      st.code = await cncGetLineLinkCode();
    } catch (err) {
      console.error(err);
      st.error = err;
    }
    st.loading = false;
    this.drawLine();
  },

  drawLine: function () {
    var box = document.getElementById('profile-line');
    if (!box) return;
    var st = this.line;
    var html = '<h2 class="card-title"><span class="line-logo" aria-hidden="true">LINE</span> ' + escHtml(t('line_title')) + '</h2>';

    if (cncIsLineLinked(APP.profile)) {
      html += '<div class="line-connected">' +
        '<p class="line-connected-text"><span aria-hidden="true">✅</span> ' + escHtml(t('line_connected')) + '</p>' +
        '<p class="muted">' + escHtml(t('line_connected_desc')) + '</p>' +
        '<button type="button" class="btn btn-outline btn-discard" onclick="PageProfile.disconnectLine()"' + (st.busy ? ' disabled' : '') + '>' +
          escHtml(st.busy ? t('admin_processing') : t('line_disconnect')) + '</button>' +
        '</div>';
      box.innerHTML = html;
      return;
    }

    html += '<p class="card-desc">' + escHtml(t('line_desc')) + '</p>' +
      '<div class="line-layout">' +
        '<ol class="line-steps">' +
          '<li><span class="line-step-num mono">1</span><div><p class="line-step-text">' + escHtml(t('line_step1')) + '</p>' +
            '<a class="btn btn-line" href="' + LINE_ADD_FRIEND_URL + '" target="_blank" rel="noopener">' + escHtml(t('line_add_friend')) + '</a></div></li>' +
          '<li><span class="line-step-num mono">2</span><div><p class="line-step-text">' + escHtml(t('line_step2')) + '</p>' +
            this.codeHtml() + '</div></li>' +
          '<li><span class="line-step-num mono">3</span><div><p class="line-step-text">' + escHtml(t('line_step3')) + '</p>' +
            '<button type="button" class="btn btn-primary" onclick="PageProfile.checkLine()"' + (st.checking ? ' disabled' : '') + '>' +
              escHtml(st.checking ? t('loading') : t('line_check_status')) + '</button></div></li>' +
        '</ol>' +
        '<div class="line-qr-box" id="line-qr-box">' +
          '<div class="line-qr" id="line-qr" aria-hidden="true"></div>' +
          '<p class="muted">' + escHtml(t('line_qr_hint')) + '</p>' +
        '</div>' +
      '</div>';
    box.innerHTML = html;
    this.drawQr();
  },

  codeHtml: function () {
    var st = this.line;
    if (st.loading) return uiLoading();
    if (st.error) {
      return '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(t('line_code_error')) + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageProfile.loadLine()">' + escHtml(t('btn_retry')) + '</button>';
    }
    if (!st.code) return '';
    return '<div class="line-code-row">' +
      '<span class="line-code mono" id="line-code">' + escHtml(st.code) + '</span>' +
      '<button type="button" class="btn btn-outline" onclick="PageProfile.copyCode()"><span aria-hidden="true">📋</span> ' + escHtml(t('line_copy')) + '</button>' +
      '</div>';
  },

  // PC 에서만 친구추가 QR 코드 (휴대폰 카메라로 찍으면 친구추가 화면)
  drawQr: function () {
    var box = document.getElementById('line-qr-box');
    var el = document.getElementById('line-qr');
    if (!box || !el) return;
    if (!window.matchMedia('(min-width: 1024px)').matches) { box.hidden = true; return; }
    loadQrLib().then(function (QRCode) {
      if (!document.body.contains(el)) return;
      el.innerHTML = '';
      new QRCode(el, { text: LINE_ADD_FRIEND_URL, width: 168, height: 168, colorDark: '#000000', colorLight: '#ffffff' });
    }).catch(function (err) {
      console.warn('QR library load failed:', err);
      box.hidden = true;
    });
  },

  copyCode: async function () {
    var code = this.line.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      uiToast(t('line_copied'), 'success');
    } catch (err) {
      // 복사가 막힌 브라우저: 글자를 선택해 둬요
      var el = document.getElementById('line-code');
      if (el && window.getSelection) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      uiToast(t('line_copy_manual'), 'info');
    }
  },

  checkLine: async function () {
    var st = this.line;
    if (st.checking) return;
    st.checking = true;
    this.drawLine();
    try {
      await cncReloadProfile();
      st.checking = false;
      if (cncIsLineLinked(APP.profile)) uiToast(t('line_connected'), 'success');
      else uiToast(t('line_not_yet'), 'info');
    } catch (err) {
      console.error(err);
      st.checking = false;
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawLine();
  },

  disconnectLine: async function () {
    var ok = await uiConfirm({ title: t('line_disconnect'), message: t('line_disconnect_confirm'), okLabel: t('line_disconnect'), danger: true });
    if (!ok) return;
    var st = this.line;
    st.busy = true;
    this.drawLine();
    try {
      await cncUnlinkLine();
      st.busy = false;
      uiToast(t('line_disconnected'), 'success');
      this.loadLine();
    } catch (err) {
      console.error(err);
      st.busy = false;
      uiToast(uiErrorMessage(err), 'error');
      this.drawLine();
    }
  },

  // 크레딧 묶음 목록: 충전일, 수량, 남은 수량, 만료일 (30일 이내 주황, 7일 이내 빨강)
  lotsHtml: function () {
    var lots = APP.lots;
    var html = '<h3 class="detail-title">' + escHtml(t('lots_title')) + '</h3>';
    if (!lots) return html + uiLoading();
    if (!lots.length) return html + '<p class="muted">' + escHtml(t('lots_empty')) + '</p>';
    return html + '<div class="table-wrap"><table class="table lots-table"><thead><tr>' +
      '<th>' + escHtml(t('lots_charged')) + '</th><th>' + escHtml(t('lots_quantity')) + '</th><th>' + escHtml(t('lots_remaining')) + '</th><th>' + escHtml(t('lots_expires')) + '</th></tr></thead><tbody>' +
      lots.map(function (l) {
        var st = cncExpiryState(l.expires_at);
        var days = cncDaysLeft(l.expires_at);
        return '<tr class="' + (st ? 'lot-' + st : '') + '">' +
          '<td class="nowrap">' + escHtml(formatDate(l.created_at)) + ' <span class="badge lot-src">' + escHtml(t('lot_source_' + l.source)) + '</span></td>' +
          '<td class="mono">' + formatNumber(l.quantity) + '</td>' +
          '<td class="mono"><b>' + formatNumber(l.remaining) + '</b></td>' +
          '<td class="nowrap lot-exp">' + escHtml(formatDate(l.expires_at)) +
            (st ? ' <span class="lot-days">' + escHtml(tf('lots_days_left', { n: days })) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  drawCredits: function () {
    var box = document.getElementById('profile-credits');
    if (!box) return;
    var html = '<h2 class="card-title">' + escHtml(t('credit_balance')) + '</h2>' +
      '<p class="big-number mono">' + (APP.balance != null ? formatNumber(APP.balance) : '—') + ' <span class="big-number-unit">' + escHtml(t('credit_unit')) + '</span></p>' +
      '<p class="card-desc">' + escHtml(t('credit_rule')) + ' · ' + escHtml(t('credit_validity_rule')) + '</p>' +
      '<a href="#/topup" class="btn btn-gold">💳 ' + escHtml(t('topup_btn')) + '</a>' +
      this.lotsHtml() +
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


// ===== QR 코드 라이브러리 (cdnjs qrcodejs 1.0.0 고정, LINE 섹션을 PC 에서 열 때만 불러와요) =====
var QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
var _qrPromise = null;
function loadQrLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (_qrPromise) return _qrPromise;
  _qrPromise = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = QR_LIB_URL;
    s.async = true;
    s.onload = function () { window.QRCode ? resolve(window.QRCode) : reject(new Error('QRCode missing')); };
    s.onerror = function () { _qrPromise = null; reject(new Error('QR load failed')); };
    document.head.appendChild(s);
  });
  return _qrPromise;
}
