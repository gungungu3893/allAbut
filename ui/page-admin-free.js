// ===== 관리자: 무료(선물) 크레딧 · 등록 치과 정보 변경 요청 (PageAdmin 에 덧붙여요) =====
// DB: sql/008_free_credits.sql
//   - 주문 목록·상세: bonus_used > 0 이면 "🎁 선물 크레딧 사용 — 등록 주소로만 출고" 배지 (상세는 출고 주소를 크게)
//   - Customers 탭 맨 위: 등록 정보 변경 요청 (manager 이상만 보여요)
//       승인 전에 고객의 미사용 무료 크레딧을 확인 → 있으면 "미사용 가입 선물 n크레딧 있음 — 승인 시 새 주소로 사용 가능해짐" 확인창
//   - 실제 권한·처리는 DB 함수 admin_review_clinic_change (manager 이상) 가 해요

Object.assign(PageAdmin, {
  clinicChanges: { rows: null, status: 'pending', error: false, missing: false },

  // 선물 크레딧 배지 (small: 목록용 작은 배지)
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
