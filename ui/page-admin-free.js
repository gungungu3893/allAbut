// ===== 관리자: 무료 크레딧 · 등록 치과 정보 변경 요청 (PageAdmin 에 덧붙여요) =====
// DB: sql/008_free_credits.sql, sql/009_free_credit_grants.sql
//   - 주문 목록·상세: bonus_used > 0 이면 "🎁 무료 크레딧 사용 — 등록 주소로만 출고" 배지 (상세는 출고 주소를 크게)
//   - Customers 탭 맨 위: 등록 정보 변경 요청 (manager 이상만 보여요)
//       승인 전에 고객의 미사용 무료 크레딧을 확인 → 있으면 "미사용 무료 크레딧 n개 있음 — 승인 시 새 주소로 사용 가능해짐" 확인창
//   - 고객 상세: 🎁 무료 크레딧 지급 (이벤트 이름 · 크레딧 수 · 유효기간(일) · 등록 주소 배송 전용) / 회수 (사유 필수) — manager 이상
//   - Settings: 🎁 신규 가입 무료 크레딧 이벤트 (sql/010: 켜기 · 기간 · 지급 방식 · 배너 · Tax ID 규칙 / 008 만: 크레딧 수)
//   - 신청 · 지급 목록 (승인 · 거절 · 회수, 의심 표시) — Settings 와 Customers 탭 맨 위 (manager 이상)
//   - 고객 상세: 의심 표시 배지 (admin_suspicion_flags)
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
  // Settings: 🎁 신규 가입 무료 크레딧 이벤트 (owner)
  //   sql/010 실행 후: 켜기 · 이름 · 크레딧 · 기간(방콕 날짜) · 유효기간 · 지급 방식 · LINE 필수 · 배너 · Tax ID 중복 규칙
  //   sql/008 만 실행: 크레딧 수만 (예전 모양)
  // ================================================================
  signupEventHtml: function (s) {
    if (!s || !('signup_bonus_credits' in s)) return '';
    if (!('signup_bonus_enabled' in s)) {
      return '<section class="card" id="signup-event">' +
        '<h2 class="card-title">🎁 ' + escHtml(t('admin_signup_bonus')) + '</h2>' +
        '<p class="card-desc">' + escHtml(t('admin_signup_bonus_help')) + '</p>' +
        '<form class="form-grid two" onsubmit="PageAdmin.saveSignupEvent(event)" novalidate>' +
          '<div class="field"><label class="field-label" for="set-signup_bonus_credits">' + escHtml(t('admin_free_credits_n')) + '</label>' +
            '<input class="input mono" id="set-signup_bonus_credits" type="number" min="0" max="100" step="1" value="' + escHtml(String(s.signup_bonus_credits || 0)) + '">' +
            '<div class="err-slot" data-se-err="credits"></div></div>' +
          '<div class="span-2"><button type="submit" class="btn btn-primary btn-lg">' + escHtml(t('pe_save')) + '</button></div>' +
        '</form></section>';
    }
    var st = cncCampaignStatus(s);
    var banner = s.signup_bonus_banner || {};
    var credits = Number(s.signup_bonus_credits || 0);
    function num(id, labelKey, value, min, max, help) {
      return '<div class="field"><label class="field-label" for="se-' + id + '">' + escHtml(t(labelKey)) + '</label>' +
        '<input class="input mono" id="se-' + id + '" type="number" min="' + min + '" max="' + max + '" step="1" inputmode="numeric" value="' + escHtml(String(value)) + '">' +
        (help ? '<p class="field-help">' + escHtml(t(help)) + '</p>' : '') +
        '<div class="err-slot" data-se-err="' + id + '"></div></div>';
    }
    function opt(value, cur, key) {
      return '<option value="' + value + '"' + (value === cur ? ' selected' : '') + '>' + escHtml(t(key)) + '</option>';
    }
    return '<section class="card" id="signup-event">' +
      '<div class="card-head"><h2 class="card-title">' + escHtml(t('camp_title')) + '</h2>' +
        '<span class="badge camp-status camp-' + st + '">' + escHtml(t('camp_status_' + st)) + '</span></div>' +
      '<p class="card-desc">' + escHtml(t('camp_help')) + '</p>' +
      '<form class="form-grid two" onsubmit="PageAdmin.saveSignupEvent(event)" novalidate>' +
        '<label class="checkbox span-2 camp-enable"><input type="checkbox" id="se-enabled"' + (s.signup_bonus_enabled ? ' checked' : '') +
          (credits < 1 && !s.signup_bonus_enabled ? ' disabled' : '') + '> <span>' + escHtml(t('camp_enabled')) + '</span></label>' +
        (credits < 1 ? '<p class="field-help span-2" id="se-need-credits"><span aria-hidden="true">ℹ</span> ' + escHtml(t('camp_err_credits')) + '</p>' : '') +
        '<div class="err-slot span-2" data-se-err="enabled"></div>' +
        '<div class="field span-2"><label class="field-label" for="se-campaign">' + escHtml(t('camp_name')) + '</label>' +
          '<input class="input" id="se-campaign" type="text" maxlength="100" value="' + escHtml(s.signup_bonus_campaign || '') + '">' +
          '<div class="err-slot" data-se-err="campaign"></div></div>' +
        num('credits', 'camp_credits', credits, 0, 100, '') +
        num('valid_days', 'admin_free_days', s.signup_bonus_valid_days || 365, 1, 3650, '') +
        '<div class="field"><span class="field-label">' + escHtml(t('camp_starts')) + '</span>' +
          uiDateField({ id: 'se-starts', value: s.signup_bonus_starts || '' }) + '<div class="err-slot" data-se-err="starts"></div></div>' +
        '<div class="field"><span class="field-label">' + escHtml(t('camp_ends')) + '</span>' +
          uiDateField({ id: 'se-ends', value: s.signup_bonus_ends || '' }) + '<div class="err-slot" data-se-err="ends"></div></div>' +
        '<p class="field-help span-2">' + escHtml(t('camp_dates_help')) + '</p>' +
        '<div class="field"><label class="field-label" for="se-mode">' + escHtml(t('camp_grant_mode')) + '</label>' +
          '<select class="input" id="se-mode">' + opt('approval', s.signup_bonus_grant_mode || 'approval', 'camp_mode_approval') +
            opt('auto', s.signup_bonus_grant_mode || 'approval', 'camp_mode_auto') + '</select></div>' +
        '<div class="field"><label class="field-label" for="se-taxpolicy">' + escHtml(t('camp_tax_policy')) + '</label>' +
          '<select class="input" id="se-taxpolicy">' + opt('block', s.tax_id_policy || 'block', 'camp_tax_block') +
            opt('allow', s.tax_id_policy || 'block', 'camp_tax_allow') + '</select></div>' +
        '<label class="checkbox span-2"><input type="checkbox" id="se-line"' + (s.signup_bonus_require_line !== false ? ' checked' : '') + '> <span>' + escHtml(t('camp_require_line')) + '</span></label>' +
        '<fieldset class="span-2 camp-banner-fields"><legend class="field-label">' + escHtml(t('camp_banner')) + '</legend>' +
          '<p class="field-help">' + escHtml(tf('camp_banner_help', { text: tf('campaign_default', { n: credits || 0 }) })) + '</p>' +
          ['en', 'th', 'ko'].map(function (l) {
            return '<div class="field"><label class="field-label" for="se-banner-' + l + '">' + l.toUpperCase() + '</label>' +
              '<input class="input" id="se-banner-' + l + '" type="text" maxlength="200" value="' + escHtml(banner[l] || '') + '"></div>';
          }).join('') +
        '</fieldset>' +
        '<div class="span-2"><button type="submit" class="btn btn-primary btn-lg">' + escHtml(t('pe_save')) + '</button></div>' +
      '</form></section>' +
      '<section class="card admin-signup-grants" id="admin-signup-grants" hidden></section>';
  },

  saveSignupEvent: async function (event) {
    event.preventDefault();
    var sx = this.settingsTab;
    var s = sx.settings || {};
    var errs = {};
    function show() {
      var slots = document.querySelectorAll('#signup-event [data-se-err]');
      for (var i = 0; i < slots.length; i++) slots[i].innerHTML = uiFieldError(errs[slots[i].getAttribute('data-se-err')]);
    }
    // 예전 모양 (sql/008 만)
    if (!('signup_bonus_enabled' in s)) {
      var v = document.getElementById('set-signup_bonus_credits').value.trim();
      if (!/^\d{1,3}$/.test(v) || +v > 100) { errs.credits = 'admin_err_signup_bonus'; show(); return; }
      show();
      try {
        sx.settings = await cncAdminSaveSignupBonus(v);
        uiToast(t('admin_settings_saved'), 'success');
      } catch (err) {
        console.error(err);
        uiToast(uiErrorMessage(err), 'error');
      }
      this.drawBody();
      return;
    }

    var val = function (id) { return document.getElementById('se-' + id).value.trim(); };
    var credits = val('credits'), days = val('valid_days');
    var fields = {
      signup_bonus_enabled: document.getElementById('se-enabled').checked,
      signup_bonus_campaign: val('campaign'),
      signup_bonus_starts: uiDateValue('se-starts') || null,
      signup_bonus_ends: uiDateValue('se-ends') || null,
      signup_bonus_grant_mode: val('mode') === 'auto' ? 'auto' : 'approval',
      tax_id_policy: val('taxpolicy') === 'allow' ? 'allow' : 'block',
      signup_bonus_require_line: document.getElementById('se-line').checked,
      // 배너: en/th/ko 만 고치고 다른 언어 값은 그대로 (빈 칸은 지움 → 기본 문구)
      signup_bonus_banner: Object.assign({}, s.signup_bonus_banner || {})
    };
    ['en', 'th', 'ko'].forEach(function (l) {
      var x = val('banner-' + l);
      if (x) fields.signup_bonus_banner[l] = x; else delete fields.signup_bonus_banner[l];
    });
    if (!/^\d{1,3}$/.test(credits) || +credits > 100) errs.credits = 'admin_err_signup_bonus';
    if (!/^\d{1,4}$/.test(days) || +days < 1 || +days > 3650) errs.valid_days = 'camp_err_days';
    if (!fields.signup_bonus_campaign) errs.campaign = 'err_required';
    if (fields.signup_bonus_enabled) {
      if (!errs.credits && +credits < 1) errs.enabled = 'camp_err_credits';
      if (!fields.signup_bonus_starts) errs.starts = 'camp_err_dates';
      if (!fields.signup_bonus_ends) errs.ends = 'camp_err_dates';
    }
    if (fields.signup_bonus_starts && fields.signup_bonus_ends && fields.signup_bonus_starts > fields.signup_bonus_ends) errs.ends = 'camp_err_order';
    show();
    if (Object.keys(errs).length) return;
    fields.signup_bonus_credits = +credits;
    fields.signup_bonus_valid_days = +days;
    try {
      sx.settings = await cncAdminSaveSignupCampaign(fields);
      cncGetSignupCampaign(true);   // 배너 캐시 새로
      uiToast(t('admin_settings_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawBody();
  },

  // ================================================================
  // 신규 가입 무료 크레딧: 승인 대기 · 지급 목록 (manager 이상)
  //   Settings(owner) 의 이벤트 카드 아래 + Customers 탭 맨 위 (manager 도 승인할 수 있게)
  // ================================================================
  signupGrants: { rows: null, status: 'pending', error: false, missing: false },

  loadSignupGrants: async function () {
    var g = this.signupGrants;
    if (!cncHasRole('manager')) { this.drawSignupGrants(); return; }
    g.error = false;
    this.drawSignupGrants();
    try {
      var rows = await cncAdminListSignupBonus(g.status);
      g.missing = rows === null;   // 010 실행 전
      g.rows = rows || [];
    } catch (err) {
      console.error(err);
      g.error = err;
    }
    this.drawSignupGrants();
  },

  setSignupGrantStatus: function (value) {
    this.signupGrants.status = value;
    this.signupGrants.rows = null;
    this.loadSignupGrants();
  },

  // 의심 표시 배지 (같은 IP 등) — 없으면 "의심 표시 없음"
  flagBadgesHtml: function (flags) {
    flags = flags || [];
    if (!flags.length) return '<span class="flag-none">' + escHtml(t('flag_none')) + '</span>';
    return flags.map(function (f) {
      return '<span class="badge flag-badge"><span aria-hidden="true">⚠</span> ' + escHtml(t('flag_' + f)) + '</span>';
    }).join(' ');
  },

  drawSignupGrants: function () {
    var box = document.getElementById('admin-signup-grants');
    if (!box) return;
    var g = this.signupGrants;
    // pending 목록이 비어 있으면 Customers 탭에서는 숨겨요 (Settings 에서는 항상 보여요)
    var onCustomers = this.tab === 'customers';
    if (!cncHasRole('manager') || g.missing || (onCustomers && g.status === 'pending' && g.rows && !g.rows.length && !g.error)) { box.hidden = true; return; }
    box.hidden = false;
    var self = this;
    var html = '<div class="card-head"><h2 class="card-title">🎁 ' + escHtml(t('camp_grants_title')) + '</h2>' +
      '<select class="input admin-deletion-filter" aria-label="' + escHtml(t('admin_filter_stage')) + '" onchange="PageAdmin.setSignupGrantStatus(this.value)">' +
        ['pending', 'granted', 'rejected', 'revoked', 'all'].map(function (v) {
          return '<option value="' + v + '"' + (g.status === v ? ' selected' : '') + '>' + escHtml(t(v === 'all' ? 'admin_filter_all' : 'grant_status_' + v)) + '</option>';
        }).join('') +
      '</select></div>' +
      '<p class="card-desc">' + escHtml(t('camp_grants_help')) + '</p>';
    if (g.error) html += '<p class="error-text">' + escHtml(uiErrorMessage(g.error)) + '</p>';
    else if (!g.rows) html += uiLoading();
    else if (!g.rows.length) html += '<p class="muted">' + escHtml(t('camp_grants_empty')) + '</p>';
    else {
      html += '<ul class="clinic-change-list signup-grant-list">' + g.rows.map(function (r) {
        var uid = escHtml(String(r.user_id));
        var flags = r.flags || [];
        return '<li class="clinic-change signup-grant' + (flags.length ? ' has-flags' : '') + '" data-user="' + uid + '">' +
          '<div class="clinic-change-head"><b>' + escHtml(r.full_name || r.email || String(r.user_id).slice(0, 8)) + '</b>' +
            ' <span class="muted">' + escHtml(formatDateTime(r.requested_at)) + '</span>' +
            ' <span class="badge grant-' + escHtml(r.status) + '">' + escHtml(t('grant_status_' + r.status)) + '</span>' +
            ' <span class="grant-credits">🎁 <b class="mono">' + formatNumber(r.credits || 0) + '</b> ' + escHtml(t('credit_unit')) + '</span></div>' +
          '<div class="grant-info">' +
            '<p>' + escHtml(r.clinic_name || '—') + (r.tax_id ? ' · <span class="mono">' + escHtml(cncFormatTaxId(r.tax_id)) + '</span>' : '') + '</p>' +
            '<p class="pre">' + escHtml(r.address || '—') + '</p>' +
            '<p>' + escHtml(r.email || '') + (r.phone ? ' · <span class="mono">' + escHtml(r.phone) + '</span>' : '') +
              ' · ' + (r.line_linked ? '✅ ' + escHtml(t('camp_line_linked')) : '❌ ' + escHtml(t('camp_line_not'))) + '</p>' +
            (r.campaign_name ? '<p class="muted">' + escHtml(r.campaign_name) + '</p>' : '') +
          '</div>' +
          '<div class="grant-flags">' + self.flagBadgesHtml(flags) + '</div>' +
          (r.reject_reason ? '<p class="muted">' + escHtml(t('camp_reason')) + ': ' + escHtml(r.reject_reason) + '</p>' : '') +
          (r.status === 'granted' && r.lot_remaining != null ? '<p class="muted">' + escHtml(tf('camp_remaining', { n: r.lot_remaining })) + '</p>' : '') +
          '<div class="action-row">' +
            (r.status === 'pending'
              ? '<button type="button" class="btn btn-primary btn-sm" onclick="PageAdmin.reviewSignupGrant(\'' + uid + '\', true)">' + escHtml(t('camp_approve')) + '</button>' +
                '<button type="button" class="btn btn-outline btn-sm btn-discard" onclick="PageAdmin.reviewSignupGrant(\'' + uid + '\', false)">' + escHtml(t('admin_reject')) + '</button>'
              : '') +
            (r.status === 'granted' && Number(r.lot_remaining || 0) > 0
              ? '<button type="button" class="btn btn-outline btn-sm btn-discard" onclick="PageAdmin.revokeSignupGrant(\'' + uid + '\')">' + escHtml(t('camp_revoke')) + '</button>'
              : '') +
          '</div></li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  },

  // 승인(바로 지급) / 거절(사유 필수)
  reviewSignupGrant: function (userId, approve) {
    var self = this;
    var r = (this.signupGrants.rows || []).filter(function (x) { return String(x.user_id) === String(userId); })[0];
    if (!r) return;
    var body = '<p class="modal-text">' + escHtml(tf(approve ? 'camp_approve_msg' : 'camp_reject_msg', { n: r.credits || 0 })) + '</p>' +
      '<p class="modal-text"><b>' + escHtml(r.full_name || r.email || '') + '</b> · ' + escHtml(r.clinic_name || '') + '</p>' +
      '<div class="grant-flags">' + this.flagBadgesHtml(r.flags) + '</div>' +
      (approve ? '' :
        '<div class="field"><label class="field-label" for="grant-reason">' + escHtml(t('camp_reason')) + ' <span class="required">*</span></label>' +
        '<textarea class="input textarea" id="grant-reason" rows="2" maxlength="500"></textarea><div class="err-slot" data-gr-err="reason"></div></div>');
    var modal = uiModal({
      title: approve ? t('camp_approve') : t('admin_reject'),
      body: body,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: approve ? t('camp_approve') : t('admin_reject'), kind: approve ? 'primary' : 'danger', onClick: async function (close, btn) {
          var reason = approve ? '' : modal.el.querySelector('#grant-reason').value.trim();
          if (!approve && !reason) { modal.el.querySelector('[data-gr-err="reason"]').innerHTML = uiFieldError('admin_free_err_reason'); return; }
          btn.disabled = true;
          try {
            await cncAdminReviewSignupBonus(userId, approve, reason);
            close();
            uiToast(t(approve ? 'camp_approved' : 'camp_rejected'), 'success');
            self.loadSignupGrants();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // 회수 (사유 필수 → 그 묶음에 남은 만큼 0)
  revokeSignupGrant: function (userId) {
    var self = this;
    var r = (this.signupGrants.rows || []).filter(function (x) { return String(x.user_id) === String(userId); })[0];
    if (!r) return;
    var modal = uiModal({
      title: t('camp_revoke'),
      body: '<p class="modal-text">' + escHtml(tf('camp_revoke_msg', { n: r.lot_remaining || 0 })) + '</p>' +
        '<div class="field"><label class="field-label" for="grant-revoke-reason">' + escHtml(t('camp_reason')) + ' <span class="required">*</span></label>' +
        '<textarea class="input textarea" id="grant-revoke-reason" rows="2" maxlength="500"></textarea><div class="err-slot" data-gr-err="reason"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('camp_revoke'), kind: 'danger', onClick: async function (close, btn) {
          var reason = modal.el.querySelector('#grant-revoke-reason').value.trim();
          if (!reason) { modal.el.querySelector('[data-gr-err="reason"]').innerHTML = uiFieldError('admin_free_err_reason'); return; }
          btn.disabled = true;
          try {
            await cncAdminRevokeSignupBonus(userId, reason);
            close();
            uiToast(t('camp_revoked'), 'success');
            self.loadSignupGrants();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
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
