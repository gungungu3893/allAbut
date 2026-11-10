// ===== 관리자: 무료 크레딧 · 등록 치과 정보 변경 요청 (PageAdmin 에 덧붙여요) =====
// DB: sql/008_free_credits.sql, sql/009_free_credit_grants.sql
//   - 주문 목록·상세: bonus_used > 0 이면 "🎁 무료 크레딧 사용 — 등록 주소로만 출고" 배지 (상세는 출고 주소를 크게)
//   - Customers 탭 맨 위: 등록 정보 변경 요청 (manager 이상만 보여요)
//       승인 전에 고객의 미사용 무료 크레딧을 확인 → 있으면 "미사용 무료 크레딧 n개 있음 — 승인 시 새 주소로 사용 가능해짐" 확인창
//   - 고객 상세: 🎁 무료 크레딧 지급 (이벤트 이름 · 크레딧 수 · 유효기간(일) · 등록 주소 배송 전용) / 회수 (사유 필수) — manager 이상
//   - Settings: 🎁 신규 가입 무료 크레딧 이벤트 (치과가 처음 등록될 때 줄 크레딧 수, 0 = 지급 안 함)
//   - 실제 권한·처리는 DB 함수 (admin_review_clinic_change · admin_grant_free_credits · admin_revoke_free_credits) 가 해요

Object.assign(PageAdmin, {
  clinicChanges: { rows: null, status: 'pending', error: false, missing: false },

  // 무료 크레딧 사용 배지 (small: 목록용 작은 배지)
  freeBadgeHtml: function (o, small) {
    if (!o || Number(o.bonus_used || 0) <= 0) return '';
    return '<span class="free-badge' + (small ? ' free-badge-sm' : '') + '" title="' + escHtml(tf('admin_free_used_n', { n: o.bonus_used })) + '">' +
      '🎁 ' + escHtml(t('admin_free_badge')) + '</span>';
  },

  loadClinicChanges: async function () {
    var cc = this.clinicChanges;
    if (!cncHasRole('manager')) { this.drawClinicChanges(); return; }
    cc.error = false;
    this.drawClinicChanges();
    try {
      var rows = await cncAdminListClinicChanges(cc.status);
      cc.missing = rows === null;   // 008 실행 전
      cc.rows = rows || [];
    } catch (err) {
      console.error(err);
      cc.error = err;
    }
    this.drawClinicChanges();
  },

  setClinicChangeStatus: function (value) {
    this.clinicChanges.status = value;
    this.clinicChanges.rows = null;
    this.loadClinicChanges();
  },

  drawClinicChanges: function () {
    var box = document.getElementById('admin-clinic-changes');
    if (!box) return;
    var cc = this.clinicChanges;
    // manager 미만이거나 008 실행 전이면 숨김
    if (!cncHasRole('manager') || cc.missing) { box.hidden = true; return; }
    box.hidden = false;
    var html = '<div class="card-head"><h2 class="card-title">🔒 ' + escHtml(t('admin_clinic_changes')) + '</h2>' +
      '<select class="input admin-deletion-filter" aria-label="' + escHtml(t('admin_filter_stage')) + '" onchange="PageAdmin.setClinicChangeStatus(this.value)">' +
        ['pending', 'all'].map(function (v) {
          return '<option value="' + v + '"' + (cc.status === v ? ' selected' : '') + '>' + escHtml(t(v === 'pending' ? 'deletion_status_pending' : 'admin_filter_all')) + '</option>';
        }).join('') +
      '</select></div>' +
      '<p class="card-desc">' + escHtml(t('admin_clinic_changes_help')) + '</p>';
    if (cc.error) html += '<p class="error-text">' + escHtml(uiErrorMessage(cc.error)) + '</p>';
    else if (!cc.rows) html += uiLoading();
    else if (!cc.rows.length) html += '<p class="muted">' + escHtml(t('admin_no_clinic_changes')) + '</p>';
    else {
      html += '<ul class="clinic-change-list">' + cc.rows.map(function (r) {
        var c = r.customer || {};
        var reg = cncRegisteredClinic(c) || { clinic: '—', addr: '—', phone: '—' };
        return '<li class="clinic-change" data-id="' + Number(r.id) + '">' +
          '<div class="clinic-change-head"><b>' + escHtml(c.clinic_name || c.nickname || String(r.user_id).slice(0, 8)) + '</b>' +
            ' <span class="muted">' + escHtml(formatDateTime(r.created_at)) + '</span>' +
            ' <span class="badge deletion-' + escHtml(r.status === 'approved' ? 'done' : r.status) + '">' + escHtml(t('clinic_change_status_' + r.status)) + '</span></div>' +
          '<div class="clinic-change-grid">' +
            '<div><p class="clinic-change-label">' + escHtml(t('admin_reg_current')) + '</p>' +
              '<p>' + escHtml(reg.clinic) + '</p><p class="pre">' + escHtml(reg.addr) + '</p><p class="mono">' + escHtml(reg.phone) + '</p></div>' +
            '<div class="clinic-change-new"><p class="clinic-change-label">' + escHtml(t('admin_reg_requested')) + '</p>' +
              '<p><b>' + escHtml(r.clinic) + '</b></p><p class="pre"><b>' + escHtml(r.addr) + '</b></p><p class="mono"><b>' + escHtml(r.phone) + '</b></p></div>' +
          '</div>' +
          (r.reason ? '<p class="muted">' + escHtml(t('reg_change_reason')) + ': ' + escHtml(r.reason) + '</p>' : '') +
          (r.admin_note ? '<p class="muted">' + escHtml(r.admin_note) + '</p>' : '') +
          (r.status === 'pending'
            ? '<div class="action-row">' +
                '<button type="button" class="btn btn-primary btn-sm" onclick="PageAdmin.reviewClinicChange(' + Number(r.id) + ', true)">' + escHtml(t('admin_approve')) + '</button>' +
                '<button type="button" class="btn btn-outline btn-sm btn-discard" onclick="PageAdmin.reviewClinicChange(' + Number(r.id) + ', false)">' + escHtml(t('admin_reject')) + '</button>' +
              '</div>'
            : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  },

  // ================================================================
  // 고객 상세: 🎁 무료 크레딧 지급 · 회수 (manager 이상)
  // ================================================================
  freeGrantHtml: function (st) {
    if (!cncHasRole('manager')) return '';
    var dis = st.busy ? ' disabled' : '';
    return '<section class="free-grant" id="free-grant">' +
      '<h3 class="detail-title">🎁 ' + escHtml(t('admin_free_grant_title')) + '</h3>' +
      '<p class="field-help">' + escHtml(t('admin_free_grant_help')) + '</p>' +
      '<div class="form-grid two">' +
        '<div class="field span-2"><label class="field-label" for="fg-event">' + escHtml(t('admin_free_event')) + ' <span class="required">*</span></label>' +
          '<input class="input" id="fg-event" type="text" maxlength="100" placeholder="' + escHtml(t('admin_free_event_ph')) + '"' + dis + '>' +
          '<div class="err-slot" data-fg-err="event"></div></div>' +
        '<div class="field"><label class="field-label" for="fg-credits">' + escHtml(t('admin_free_credits_n')) + ' <span class="required">*</span></label>' +
          '<input class="input mono" id="fg-credits" type="number" min="1" max="1000" step="1" inputmode="numeric"' + dis + '>' +
          '<div class="err-slot" data-fg-err="credits"></div></div>' +
        '<div class="field"><label class="field-label" for="fg-days">' + escHtml(t('admin_free_days')) + '</label>' +
          '<input class="input mono" id="fg-days" type="number" min="1" max="3650" step="1" inputmode="numeric" value="365"' + dis + '>' +
          '<div class="err-slot" data-fg-err="days"></div></div>' +
        '<label class="checkbox span-2"><input type="checkbox" id="fg-address-only" checked' + dis + '> <span>' + escHtml(t('admin_free_address_only')) + '</span></label>' +
      '</div>' +
      '<div class="action-row">' +
        '<button type="button" class="btn btn-gold" onclick="PageAdmin.grantFreeCredits()"' + dis + '>🎁 ' + escHtml(t('admin_free_grant_btn')) + '</button>' +
        (st.free > 0 ? '<button type="button" class="btn btn-outline btn-discard" onclick="PageAdmin.revokeFreeCredits()"' + dis + '>' + escHtml(t('admin_free_revoke_btn')) + '</button>' : '') +
      '</div>' +
    '</section>';
  },

  grantFreeCredits: function () {
    var self = this;
    var st = this.customer;
    if (!st || st.busy) return;
    var box = st.modal.el;
    var ev = box.querySelector('#fg-event').value.trim();
    var n = box.querySelector('#fg-credits').value.trim();
    var days = box.querySelector('#fg-days').value.trim() || '365';
    var addressOnly = box.querySelector('#fg-address-only').checked;
    var errs = {};
    if (!ev) errs.event = 'admin_free_err_event';
    if (!/^\d{1,4}$/.test(n) || +n < 1 || +n > 1000) errs.credits = 'admin_free_err_credits';
    if (!/^\d{1,4}$/.test(days) || +days < 1 || +days > 3650) errs.days = 'admin_free_err_days';
    var slots = box.querySelectorAll('[data-fg-err]');
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = uiFieldError(errs[slots[i].getAttribute('data-fg-err')]);
    if (Object.keys(errs).length) return;
    var until = new Date(Date.now() + (+days) * 86400000);
    var who = st.user.clinic_name || st.user.nickname || st.user.email || '';
    var modal = uiModal({
      title: '🎁 ' + t('admin_free_grant_btn'),
      body: '<p class="modal-text">' + escHtml(tf('admin_free_grant_confirm', { name: who, n: n })) + '</p>' +
        '<div class="reg-box" id="fg-summary">' +
          '<p><b>' + escHtml(t('admin_free_event')) + ':</b> ' + escHtml(ev) + '</p>' +
          '<p><b>' + escHtml(t('admin_free_credits_n')) + ':</b> <span class="mono">' + escHtml(n) + '</span></p>' +
          '<p><b>' + escHtml(t('lots_expires')) + ':</b> ' + escHtml(formatDate(until.toISOString())) + '</p>' +
          '<p>' + escHtml(t(addressOnly ? 'admin_free_address_only' : 'admin_free_any_address')) + '</p>' +
        '</div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('admin_free_grant_btn'), kind: 'primary', onClick: async function (close, btn) {
          btn.disabled = true;
          try {
            var bal = await cncAdminGrantFreeCredits(st.user.id, { event: ev, credits: n, days: days, addressOnly: addressOnly });
            close();
            uiToast(tf('admin_free_granted', { n: n }), 'success');
            if (bal != null) self.syncUserBalance(st.user.id, Number(bal));
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
            return;
          }
          self.loadCustomer();
        } }
      ]
    });
  },

  revokeFreeCredits: function () {
    var self = this;
    var st = this.customer;
    if (!st || st.busy) return;
    var modal = uiModal({
      title: t('admin_free_revoke_btn'),
      body: '<p class="modal-text">' + escHtml(tf('admin_free_revoke_text', { n: st.free })) + '</p>' +
        '<div class="field"><label class="field-label" for="fr-amount">' + escHtml(t('admin_free_credits_n')) + ' <span class="required">*</span></label>' +
          '<input class="input mono" id="fr-amount" type="number" min="1" max="' + Number(st.free) + '" step="1" inputmode="numeric"><div class="err-slot" data-fr-err="amount"></div></div>' +
        '<div class="field"><label class="field-label" for="fr-reason">' + escHtml(t('reg_change_reason')) + ' <span class="required">*</span></label>' +
          '<textarea class="input textarea" id="fr-reason" rows="2" maxlength="300"></textarea><div class="err-slot" data-fr-err="reason"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('admin_free_revoke_btn'), kind: 'danger', onClick: async function (close, btn) {
          var amount = modal.el.querySelector('#fr-amount').value.trim();
          var reason = modal.el.querySelector('#fr-reason').value.trim();
          var errs = {};
          if (!/^\d{1,4}$/.test(amount) || +amount < 1 || +amount > st.free) errs.amount = 'admin_free_err_credits';
          if (!reason) errs.reason = 'admin_free_err_reason';
          modal.el.querySelector('[data-fr-err="amount"]').innerHTML = uiFieldError(errs.amount);
          modal.el.querySelector('[data-fr-err="reason"]').innerHTML = uiFieldError(errs.reason);
          if (Object.keys(errs).length) return;
          btn.disabled = true;
          try {
            var bal = await cncAdminRevokeFreeCredits(st.user.id, amount, reason);
            close();
            uiToast(t('admin_settings_saved'), 'success');
            if (bal != null) self.syncUserBalance(st.user.id, Number(bal));
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
            return;
          }
          self.loadCustomer();
        } }
      ]
    });
  },

  // ================================================================
  // Settings: 🎁 신규 가입 무료 크레딧 이벤트 (sql/008 실행 후에만)
  // ================================================================
  signupEventHtml: function (s) {
    if (!s || !('signup_bonus_credits' in s)) return '';
    return '<section class="card" id="signup-event">' +
      '<h2 class="card-title">🎁 ' + escHtml(t('admin_signup_bonus')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('admin_signup_bonus_help')) + '</p>' +
      '<form class="form-grid two" onsubmit="PageAdmin.saveSignupEvent(event)" novalidate>' +
        '<div class="field"><label class="field-label" for="set-signup_bonus_credits">' + escHtml(t('admin_free_credits_n')) + '</label>' +
          '<input class="input mono" id="set-signup_bonus_credits" type="number" min="0" max="100" step="1" value="' + escHtml(String(s.signup_bonus_credits || 0)) + '">' +
          '<div class="err-slot" data-se-err="n"></div></div>' +
        '<div class="span-2"><button type="submit" class="btn btn-primary btn-lg">' + escHtml(t('pe_save')) + '</button></div>' +
      '</form></section>';
  },

  saveSignupEvent: async function (event) {
    event.preventDefault();
    var sx = this.settingsTab;
    var v = document.getElementById('set-signup_bonus_credits').value.trim();
    var slot = document.querySelector('[data-se-err="n"]');
    if (!/^\d{1,3}$/.test(v) || +v > 100) { slot.innerHTML = uiFieldError('admin_err_signup_bonus'); return; }
    slot.innerHTML = '';
    try {
      sx.settings = await cncAdminSaveSignupBonus(v);
      uiToast(t('admin_settings_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawBody();
  },

  // 승인 / 거절 — 승인 전에 미사용 무료 크레딧이 있으면 경고 확인창
  reviewClinicChange: async function (id, approve) {
    var self = this;
    var r = (this.clinicChanges.rows || []).filter(function (x) { return Number(x.id) === Number(id); })[0];
    if (!r) return;
    var free = 0;
    if (approve) {
      try { free = await cncAdminFreeCredits(r.user_id); } catch (err) { console.warn('free credits read failed', err); }
    }
    var body = '<p class="modal-text">' + escHtml(t(approve ? 'admin_clinic_approve_msg' : 'admin_clinic_reject_msg')) + '</p>' +
      (approve
        ? '<div class="reg-box"><p class="reg-box-title">' + escHtml(t('admin_reg_requested')) + '</p>' +
            '<p class="reg-box-name">' + escHtml(r.clinic) + '</p><p class="reg-box-line pre">' + escHtml(r.addr) + '</p><p class="reg-box-line mono">' + escHtml(r.phone) + '</p></div>'
        : '') +
      (approve && free > 0
        ? '<p class="free-warn-strong" id="free-warn" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(tf('admin_clinic_free_warning', { n: free })) + '</p>'
        : '') +
      '<div class="field"><label class="field-label" for="clinic-change-note">' + escHtml(t('col_description')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
      '<textarea class="input textarea" id="clinic-change-note" rows="2" maxlength="500"></textarea></div>';
    var modal = uiModal({
      title: approve ? t('admin_approve') : t('admin_reject'),
      body: body,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: approve ? t('admin_approve') : t('admin_reject'), kind: approve ? 'primary' : 'danger', onClick: async function (close, btn) {
          btn.disabled = true;
          try {
            await cncAdminReviewClinicChange(id, approve, modal.el.querySelector('#clinic-change-note').value);
            close();
            uiToast(t('admin_settings_saved'), 'success');
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
          self.loadClinicChanges();
        } }
      ]
    });
  }
});
