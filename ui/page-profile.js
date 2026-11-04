// ===== 내 정보 #/profile =====
// - 닉네임·이메일(읽기 전용), 치과 정보(Clinic name, Address, Phone, Tax ID), 언어 → 저장
// - 크레딧 잔액 + 크레딧 이력 표
// - LINE 알림 연결 (공통 부품 ui/line-connect.js 의 LineConnect.mountSection 을 그대로 써요)

var PageProfile = {
  main: null,
  history: null,
  historyError: false,
  errors: {},
  saving: false,
  loadToken: 0,
  scrollToLine: false,   // 헤더의 "LINE 연결됨" 체크를 누르고 들어오면 LINE 섹션으로 내려가요

  render: function (main) {
    this.main = main;
    this.history = null;
    this.historyError = false;
    this.errors = {};
    this.draw();
    this.loadHistory();
    this.loadDeletion();
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
        '<section class="card delete-card" id="profile-delete"></section>' +
      '</div>';
    this.drawCredits();
    LineConnect.mountSection(document.getElementById('profile-line'));
    this.drawDelete();
  },

  // ================================================================
  // 계정 삭제 요청
  // ================================================================
  deletion: undefined,   // 내 최근 삭제 요청 (undefined = 아직 안 읽음)

  loadDeletion: async function () {
    try {
      this.deletion = await cncMyDeletionRequest();
    } catch (err) {
      console.warn('Deletion request read failed:', err);
      this.deletion = null;
    }
    this.drawDelete();
  },

  drawDelete: function () {
    var box = document.getElementById('profile-delete');
    if (!box) return;
    var d = this.deletion;
    var html = '<h2 class="card-title">' + escHtml(t('delete_title')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('delete_desc')) + '</p>';
    if (d && d.status === 'pending') {
      html += '<p class="delete-pending"><span aria-hidden="true">⏳</span> ' + escHtml(tf('delete_pending', { date: formatDate(d.created_at) })) + '</p>';
    } else {
      if (d && d.status === 'rejected') html += '<p class="muted">' + escHtml(tf('delete_rejected', { date: formatDate(d.handled_at) })) + '</p>';
      html += '<button type="button" class="btn btn-outline btn-discard" onclick="PageProfile.requestDeletion()">' + escHtml(t('delete_btn')) + '</button>';
    }
    html += '<p class="muted delete-links"><a href="#/privacy">' + escHtml(t('legal_privacy')) + '</a></p>';
    box.innerHTML = html;
  },

  requestDeletion: function () {
    var self = this;
    var modal = uiModal({
      title: t('delete_btn'),
      body: '<p class="modal-text">' + escHtml(t('delete_confirm_text')) + '</p>' +
        '<div class="field"><label class="field-label" for="delete-reason">' + escHtml(t('delete_reason')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
        '<textarea class="input textarea" id="delete-reason" rows="3" maxlength="1000"></textarea></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('delete_submit'), kind: 'danger', onClick: async function (close, btn) {
          btn.disabled = true;
          var reason = modal.el.querySelector('#delete-reason').value.trim();
          try {
            var res = await cncRequestDeletion(reason);
            close();
            var msg = t('delete_done');
            if (res && (res.active_orders > 0 || res.balance > 0)) {
              msg += ' ' + tf('delete_done_pending_items', { orders: res.active_orders || 0, credits: res.balance || 0 });
            }
            uiModal({ title: t('delete_done_title'), body: '<p class="modal-text">' + escHtml(msg) + '</p>', actions: [{ label: t('btn_ok'), kind: 'primary' }] });
            self.loadDeletion();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
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

