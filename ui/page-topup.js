// ===== 크레딧 충전 #/topup =====
// 1) 패키지 고르기 (크레딧 수, 개당 가격, 할인율, 합계 / VAT / 총액)
// 2) 결제: 총액 → PromptPay QR(은행 앱으로 스캔) 또는 계좌이체 → 입금 슬립 올리기 → "Submit payment"
// 3) 완료: "확인 중이에요. 승인되면 LINE 으로 알려드려요"
// 아래쪽: 내 충전 내역 (확인 중이면 취소 가능)
//
// 금액은 화면에 보여주기만 하고, 실제 청구 금액은 DB 함수(create_topup_request)가 다시 계산해요.

var PageTopup = {
  main: null,
  step: 'choose',      // 'choose' | 'pay' | 'done'
  packages: null,
  settings: null,
  selected: null,      // 고른 패키지
  slip: null,          // 고른 슬립 파일 (File)
  slipUrl: null,       // 미리보기 주소
  slipError: '',
  policyRead: false,   // "Credit & Refund Policy 를 읽었습니다" 체크
  policyError: false,
  submitting: false,
  submitError: null,
  done: null,          // 완료 결과 { id, total, ... }
  history: null,
  historyError: false,
  loadError: null,
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.step = 'choose';
    this.selected = null;
    this.clearSlip();
    this.submitError = null;
    this.done = null;
    this.policyRead = false;
    this.policyError = false;
    this.draw();
    this.load();
  },

  rerender: function () {
    this.draw();
  },

  leave: function () {
    this.loadToken++;
    this.clearSlip();
  },

  load: async function () {
    var token = ++this.loadToken;
    this.loadError = null;
    try {
      var res = await Promise.all([cncGetPackages(), cncGetPaymentSettings(), cncListMyTopups(30)]);
      if (token !== this.loadToken) return;
      this.packages = res[0];
      this.settings = res[1];
      this.history = res[2];
      this.historyError = false;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.loadError = err;
    }
    this.draw();
  },

  loadHistory: async function () {
    try {
      this.history = await cncListMyTopups(30);
      this.historyError = false;
    } catch (err) {
      console.error(err);
      this.historyError = true;
    }
    this.drawHistory();
  },

  clearSlip: function () {
    if (this.slipUrl) { try { URL.revokeObjectURL(this.slipUrl); } catch (e) { /* 무시 */ } }
    this.slip = null;
    this.slipUrl = null;
    this.slipError = '';
  },

  // ================================================================
  // 그리기
  // ================================================================
  draw: function () {
    if (!this.main) return;
    var html = '<div class="page page-topup">' +
      lineBannerHtml() +
      '<div class="page-head">' +
        '<h1 class="page-title"><span aria-hidden="true">💳</span> ' + escHtml(t('topup_title')) + '</h1>' +
        '<p class="topup-balance">' + escHtml(t('credit_balance')) + ': <b class="mono">' + (APP.balance != null ? formatNumber(APP.balance) : '—') + '</b> ' + escHtml(t('credit_unit')) + '</p>' +
        '<p class="topup-split">' + uiCreditSplitHtml({ expiry: true }) + '</p>' +
      '</div>' +
      '<div id="topup-body"></div>' +
      '<section class="card topup-history" id="topup-history"></section>' +
      '</div>';
    this.main.innerHTML = html;
    this.drawBody();
    this.drawHistory();
  },

  drawBody: function () {
    var box = document.getElementById('topup-body');
    if (!box) return;
    if (this.loadError) {
      box.innerHTML = '<div class="card"><p class="error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageTopup.load()">' + escHtml(t('btn_retry')) + '</button>' + uiContactHelpHtml() + '</div>';
      return;
    }
    if (!this.packages || !this.settings) { box.innerHTML = '<div class="card">' + uiLoading() + '</div>'; return; }
    if (this.step === 'done') box.innerHTML = this.doneHtml();
    else if (this.step === 'pay') { box.innerHTML = this.payHtml(); this.drawQr(); }
    else box.innerHTML = this.chooseHtml();
  },

  // ----- 1) 패키지 -----
  chooseHtml: function () {
    var self = this;
    var vat = Number(this.settings.vat_rate || 0);
    if (!this.packages.length) return '<div class="card"><p class="empty-text">' + escHtml(t('topup_no_packages')) + '</p></div>';
    return '<p class="page-desc topup-desc">' + escHtml(tf('topup_desc', { vat: formatNumber(vat) })) + '</p>' +
      '<p class="topup-expiry-note"><span aria-hidden="true">⏳</span> ' + escHtml(t('topup_expiry_note')) + '</p>' +
      '<div class="package-grid">' + this.packages.map(function (p) {
        var price = cncPackagePrice(p, vat);
        var discount = cncPackageDiscount(p, self.packages);
        var badge = Number(p.credits) === 30 ? '<span class="pkg-badge popular">' + escHtml(t('topup_popular')) + '</span>'
          : (Number(p.credits) === 100 ? '<span class="pkg-badge best">' + escHtml(t('topup_best_value')) + '</span>' : '');
        return '<button type="button" class="package-card' + (badge ? ' featured' : '') + '" onclick="PageTopup.choose(' + Number(p.id) + ')">' +
          badge +
          '<span class="pkg-credits mono">' + formatNumber(p.credits) + '</span>' +
          '<span class="pkg-unit">' + escHtml(t('credit_unit')) + '</span>' +
          '<span class="pkg-each">' + escHtml(tf('topup_each', { price: formatTHB(p.unit_price) })) + '</span>' +
          (discount ? '<span class="pkg-discount">' + escHtml(tf('topup_discount', { n: discount })) + '</span>' : '<span class="pkg-discount none"></span>') +
          '<span class="pkg-lines">' +
            '<span><span>' + escHtml(t('topup_subtotal')) + '</span><span class="mono">' + formatTHB(price.subtotal) + '</span></span>' +
            '<span><span>' + escHtml(tf('topup_vat', { n: formatNumber(vat) })) + '</span><span class="mono">' + formatTHB(price.vat) + '</span></span>' +
            '<span class="pkg-total"><span>' + escHtml(t('topup_total')) + '</span><span class="mono">' + formatTHB(price.total) + '</span></span>' +
          '</span>' +
          '<span class="btn pkg-choose">' + escHtml(t('topup_choose')) + '</span>' +
          '</button>';
      }).join('') + '</div>';
  },

  choose: function (id) {
    this.selected = (this.packages || []).filter(function (p) { return Number(p.id) === Number(id); })[0] || null;
    if (!this.selected) return;
    this.step = 'pay';
    this.clearSlip();
    this.submitError = null;
    this.drawBody();
    window.scrollTo(0, 0);
  },

  back: function () {
    if (this.submitting) return;
    this.step = 'choose';
    this.clearSlip();
    this.drawBody();
  },

  // ----- 2) 결제 -----
  payHtml: function () {
    var p = this.selected;
    var s = this.settings;
    var vat = Number(s.vat_rate || 0);
    var price = cncPackagePrice(p, vat);
    var ppOk = isValidPromptPayId(s.promptpay_id);
    var dis = this.submitting ? ' disabled' : '';

    function copyRow(labelKey, value) {
      if (!value) return '';
      return '<div class="pay-row"><span class="pay-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="pay-value mono">' + escHtml(value) + '</span>' +
        '<button type="button" class="btn btn-outline btn-sm" data-copy="' + escHtml(value) + '" onclick="PageTopup.copy(this)">' +
          '<span aria-hidden="true">📋</span> ' + escHtml(t('line_copy')) + '</button></div>';
    }

    var slipPreview = '';
    if (this.slip) {
      slipPreview = '<div class="slip-preview">' +
        (fileKind(this.slip.name) === 'image'
          ? '<img src="' + escHtml(this.slipUrl) + '" alt="' + escHtml(t('topup_slip_preview')) + '">'
          : '<span class="slip-pdf" aria-hidden="true">📄</span>') +
        '<span class="file-info"><span class="file-name">' + escHtml(this.slip.name) + '</span><span class="file-size mono">' + formatBytes(this.slip.size) + '</span></span>' +
        '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageTopup.removeSlip()"' + dis + '><span aria-hidden="true">✕</span> ' + escHtml(t('btn_remove')) + '</button>' +
        '</div>';
    }

    return '<button type="button" class="btn btn-outline btn-sm topup-back" onclick="PageTopup.back()"' + dis + '><span class="arrow" aria-hidden="true">←</span> ' + escHtml(t('topup_change_package')) + '</button>' +
      '<div class="topup-pay">' +
        '<section class="card pay-summary">' +
          '<p class="pay-pkg">' + escHtml(tf('topup_pkg_line', { n: formatNumber(p.credits) })) + '</p>' +
          '<p class="pay-total-label">' + escHtml(t('topup_total_vat')) + '</p>' +
          '<p class="pay-total mono">' + formatTHB(price.total) + '</p>' +
          '<p class="muted">' + escHtml(t('topup_subtotal')) + ' ' + formatTHB(price.subtotal) + ' + ' + escHtml(tf('topup_vat', { n: formatNumber(vat) })) + ' ' + formatTHB(price.vat) + '</p>' +
        '</section>' +

        '<section class="card pay-methods">' +
          '<h2 class="card-title">' + escHtml(t('topup_step_pay')) + '</h2>' +
          (ppOk
            ? '<div class="pp-box"><p class="pp-title">PromptPay</p><div class="pp-qr" id="pp-qr" role="img" aria-label="PromptPay QR"></div>' +
                '<p class="pp-amount mono">' + formatTHB(price.total) + '</p>' +
                '<p class="pp-hint">' + escHtml(t('topup_scan_hint')) + '</p></div>'
            : '<p class="muted">' + escHtml(t('topup_no_promptpay')) + '</p>') +
          ((s.bank_name || s.account_number)
            ? '<div class="pay-bank"><p class="pay-bank-title">' + escHtml(t('topup_bank_transfer')) + '</p>' +
                copyRow('topup_bank', s.bank_name) + copyRow('topup_account_name', s.account_name) + copyRow('topup_account_number', s.account_number) +
                (ppOk ? copyRow('topup_promptpay_id', s.promptpay_id) : '') +
              '</div>'
            : '') +
          (s.note ? '<p class="pay-note pre">' + escHtml(s.note) + '</p>' : '') +
        '</section>' +

        '<section class="card pay-slip">' +
          '<h2 class="card-title">' + escHtml(t('topup_step_slip')) + '</h2>' +
          '<p class="muted">' + escHtml(t('topup_slip_help')) + '</p>' +
          (this.slip ? slipPreview
            : '<div class="drop-zone slip-drop"><span class="drop-icon" aria-hidden="true">🧾</span>' +
                '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'slip-input\').click()"' + dis + '>' + escHtml(t('topup_choose_slip')) + '</button>' +
                '<p class="drop-hint">' + escHtml(t('topup_slip_formats')) + '</p></div>') +
          '<input type="file" id="slip-input" accept="image/*,.pdf" hidden onchange="PageTopup.pickSlip(this.files[0]); this.value=\'\'">' +
          uiFieldError(this.slipError) +
          '<label class="checkbox policy-check"><input type="checkbox" id="policy-read"' + (this.policyRead ? ' checked' : '') + dis +
            ' onchange="PageTopup.policyRead = this.checked; PageTopup.policyError = false"> <span>' +
            escHtml(t('topup_policy_read')).replace('{policy}', '<a href="#/credit-policy" target="_blank" rel="noopener">' + escHtml(t('legal_credit')) + '</a>') + '</span></label>' +
          (this.policyError ? uiFieldError('topup_policy_required') : '') +
          (this.submitError ? '<div class="notice notice-error" role="alert"><p><span aria-hidden="true">⚠</span> ' + escHtml(this.errorText(this.submitError)) + '</p>' + uiContactHelpHtml() + '</div>' : '') +
          '<button type="button" class="btn btn-gold btn-lg btn-block" onclick="PageTopup.submit()"' + dis + '>' +
            (this.submitting ? '<span class="spinner" aria-hidden="true"></span> ' + escHtml(t('submitting')) : escHtml(t('topup_submit'))) + '</button>' +
        '</section>' +
      '</div>';
  },

  drawQr: function () {
    var el = document.getElementById('pp-qr');
    if (!el || !this.selected) return;
    var price = cncPackagePrice(this.selected, this.settings.vat_rate);
    var payload = promptPayPayload(this.settings.promptpay_id, price.total);
    loadQrLib().then(function (QRCode) {
      if (!document.body.contains(el)) return;
      el.innerHTML = '';
      new QRCode(el, { text: payload, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      el.setAttribute('data-payload', payload);
    }).catch(function (err) {
      console.warn('QR library load failed:', err);
      el.innerHTML = '<p class="muted">' + escHtml(t('topup_qr_error')) + '</p>';
    });
  },

  copy: async function (btn) {
    var value = btn.getAttribute('data-copy');
    try {
      await navigator.clipboard.writeText(value);
      uiToast(t('topup_copied'), 'success');
    } catch (err) {
      uiToast(value, 'info');
    }
  },

  pickSlip: function (file) {
    if (!file) return;
    var bad = cncCheckSlipFile(file);
    this.clearSlip();
    if (bad) {
      this.slipError = bad;
    } else {
      this.slip = file;
      this.slipUrl = URL.createObjectURL(file);
    }
    this.submitError = null;
    this.drawBody();
  },

  removeSlip: function () {
    this.clearSlip();
    this.drawBody();
  },

  errorText: function (err) {
    var code = cncErrorCode(err);
    var map = {
      SLIP_INVALID: err && err.key ? err.key : 'topup_slip_required',
      SLIP_NOT_FOUND: 'err_upload_failed',
      TOO_MANY_PENDING: 'topup_err_too_many',
      PACKAGE_NOT_FOUND: 'topup_err_package'
    };
    if (map[code]) return t(map[code]);
    return uiErrorMessage(err);
  },

  submit: async function () {
    if (this.submitting) return;   // 두 번 클릭 방지
    if (!this.slip) {
      this.slipError = 'topup_slip_required';
      this.drawBody();
      return;
    }
    if (!this.policyRead) {
      this.policyError = true;
      this.drawBody();
      return;
    }
    this.submitting = true;
    this.submitError = null;
    this.drawBody();
    try {
      this.done = await cncCreateTopup(this.selected.id, this.slip);
      this.submitting = false;
      this.step = 'done';
      this.clearSlip();
      this.drawBody();
      this.loadHistory();
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      this.submitting = false;
      this.submitError = err;
      this.drawBody();
    }
  },

  // ----- 3) 완료 -----
  doneHtml: function () {
    var d = this.done || {};
    var linked = cncIsLineLinked(APP.profile);
    return '<div class="card success-card topup-done" role="status">' +
      '<div class="success-check" aria-hidden="true">✓</div>' +
      '<h2 class="success-title">' + escHtml(t('topup_done_title')) + '</h2>' +
      '<p class="success-text">' + escHtml(linked ? t('topup_done_text') : t('topup_done_text_noline')) + '</p>' +
      '<p class="success-label">' + escHtml(t('topup_request_no')) + '</p>' +
      '<p class="success-id mono">' + escHtml(d.id || '') + '</p>' +
      '<p class="success-text">' + escHtml(tf('topup_pkg_line', { n: formatNumber(d.credits || 0) })) + ' · ' + formatTHB(d.total || 0) + '</p>' +
      lineCtaHtml() +
      '<div class="success-actions">' +
        '<a href="#/home" class="btn btn-primary btn-lg">' + escHtml(t('nav_home')) + '</a>' +
      '</div>' +
      '</div>';
  },

  // ----- 내 충전 내역 -----
  drawHistory: function () {
    var box = document.getElementById('topup-history');
    if (!box) return;
    var html = '<h2 class="card-title">' + escHtml(t('topup_history')) + '</h2>';
    if (this.historyError) {
      html += '<p class="error-text">' + escHtml(t('load_error')) + '</p>';
    } else if (this.history === null) {
      html += uiLoading();
    } else if (!this.history.length) {
      html += '<p class="empty-text">' + escHtml(t('topup_history_empty')) + '</p>';
    } else {
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>' + escHtml(t('topup_request_no')) + '</th><th>' + escHtml(t('col_date')) + '</th><th>' + escHtml(t('topup_package')) + '</th>' +
        '<th>' + escHtml(t('topup_total')) + '</th><th>' + escHtml(t('col_status')) + '</th><th></th></tr></thead><tbody>' +
        this.history.map(function (r) {
          return '<tr><td class="mono nowrap">' + escHtml(r.id) + '</td>' +
            '<td class="nowrap">' + escHtml(formatDate(r.created_at)) + '</td>' +
            '<td class="mono">' + formatNumber(r.credits) + '</td>' +
            '<td class="mono nowrap">' + formatTHB(r.total) + '</td>' +
            '<td>' + uiTopupBadge(r.status) +
              (r.status === 'rejected' && r.reject_reason ? '<p class="topup-reason">' + escHtml(r.reject_reason) + '</p>' : '') + '</td>' +
            '<td>' + (r.status === 'pending'
              ? '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageTopup.cancel(\'' + escHtml(r.id) + '\')">' + escHtml(t('btn_cancel')) + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
  },

  cancel: async function (id) {
    var ok = await uiConfirm({ title: t('topup_cancel_title'), message: tf('topup_cancel_msg', { id: id }), okLabel: t('topup_cancel_title'), danger: true });
    if (!ok) return;
    try {
      await cncCancelTopup(id);
      uiToast(t('topup_cancelled'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.loadHistory();
  }
};
