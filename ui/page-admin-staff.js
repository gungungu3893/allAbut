// ================================================================
// allAbut — 대표(owner)의 "직원" 메뉴 (#/admin/team, sql/023) — 기존 Team 탭을 넓혔어요. PageAdmin 에 덧붙여요
// ================================================================
// page-admin-team.js · page-admin-sales.js 다음에 불러와요 (loadTeam · teamHtml 을 바꿔 끼워요 — 023 전이면 예전 Team 화면 그대로)
//   1) [초대 링크 만들기] 역할(영업 · 제작 직원 · 매니저) + 유효 시간 + 메모 → 링크 + [복사] + "한 번만 · n시간 뒤 만료" (창을 닫으면 다시 못 봐요)
//   2) 직원 목록: 이름 · 이메일 · 전화 · 역할 · (영업) 거래처 수 · 커미션 요율 · 상태(활동 중 / 확인 대기 / 정지) · 가입일 · 마지막 로그인
//      직원마다: 역할 변경 · 매니저 [확인] · [거래처 보기] (다른 영업에게 옮기기 · 여러 곳 한꺼번에) · 커미션 설정 · [정지] / [다시 켜기] ·
//      이름 수정 · 기존 팀원은 [직원 계정으로 전환] (크레딧 잔액 · 진행 중 주문이 있으면 막혀요)
//      자기 자신 · 마지막 owner 는 정지 · 역할 변경 불가
//   3) 초대 목록: 역할 · 메모 · 만든 날 · 만료 · 상태(대기 / 사용됨(누가) / 만료 / 취소) + [취소]
//   4) 작게: "기존 계정을 직원으로 전환" (예전 "이메일로 팀원 추가" = admin_add_member)
//   모든 변경은 작업 기록(admin_audit_log)에 남아요 (서버 함수가 기록)

var _legacyTeamHtml = PageAdmin.teamHtml;
var _legacyLoadTeam = PageAdmin.loadTeam;

Object.assign(PageAdmin, {
  staffMenu: { rows: null, invites: null, missing: false, error: null },

  loadTeam: async function () {
    var sm = this.staffMenu;
    var st = this.team;
    var token = ++this.loadToken;
    sm.error = null;
    this.drawBody();
    try {
      var res = await Promise.all([
        cncAdminListStaff(),
        cncAdminListSalesReps(true).catch(function () { return null; }),
        cncAdminListStaffInvites()
      ]);
      if (token !== this.loadToken) return;
      sm.missing = false;
      sm.rows = res[0];
      sm.invites = res[2];
      st.reps = res[1];
      if (res[1]) this.reps = res[1];
      // 기존 Team 함수(이름 수정 · 역할 · 영업 스위치 · 커미션 설정)가 쓰는 목록도 같이
      st.rows = res[0].map(function (m) { return { user_id: m.user_id, email: m.email, display_name: m.display_name, role: m.role, created_at: m.created_at }; });
    } catch (err) {
      if (token !== this.loadToken) return;
      if (cncIsMissingFunction(err)) { sm.missing = true; return _legacyLoadTeam.call(this); }   // 023 전
      console.error(err);
      sm.error = err;
    }
    this.drawBody();
  },

  teamHtml: function () {
    var sm = this.staffMenu;
    if (sm.missing) return _legacyTeamHtml.call(this);
    if (sm.error) return this.errorBox('PageAdmin.loadTeam()', sm.error);
    var html = '<div class="admin-staff">' +
      '<section class="card staff-head"><div class="card-head"><h2 class="card-title">' + escHtml(t('staff_menu_title')) + '</h2>' +
        '<button type="button" class="btn btn-primary" onclick="PageAdmin.openInviteModal()">＋ ' + escHtml(t('staff_invite_btn')) + '</button></div>' +
        '<p class="card-desc">' + escHtml(t('staff_menu_desc')) + '</p></section>';
    html += '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('team_members')) + '</h2>' +
      (sm.rows ? '<span class="muted">' + escHtml(tf('team_count', { n: sm.rows.length })) + '</span>' : '') + '</div>' +
      (sm.rows ? this.staffListHtml() : uiLoading()) + '</section>';
    html += '<section class="card"><h2 class="card-title">' + escHtml(t('staff_invites_title')) + '</h2>' +
      (sm.invites ? this.inviteListHtml() : uiLoading()) + '</section>';
    // 기존 계정을 직원으로 전환 (예전 "이메일로 팀원 추가") — 작게
    html += '<details class="card staff-legacy-add"><summary>' + escHtml(t('staff_legacy_add')) + '</summary>' +
      '<p class="field-help">' + escHtml(t('staff_legacy_add_help')) + '</p>' + this.legacyAddFormHtml() + '</details>';
    return html + '</div>';
  },

  legacyAddFormHtml: function () {
    var st = this.team;
    var roles = st.reps ? TEAM_ROLES : ADMIN_ROLES;
    return '<form class="form-grid two" onsubmit="PageAdmin.addMember(event)" novalidate>' +
      '<div class="field"><label class="field-label" for="team-email">' + escHtml(t('email_label')) + '</label>' +
        '<input class="input" id="team-email" type="email" autocomplete="off" maxlength="200">' +
        '<div class="err-slot" data-err="team-email">' + (st.errors.email ? uiFieldError(st.errors.email) : '') + '</div></div>' +
      '<div class="field"><label class="field-label" for="team-name">' + escHtml(t('team_name_label')) + '</label>' +
        '<input class="input" id="team-name" type="text" maxlength="60" placeholder="' + escHtml(t('team_name_placeholder')) + '"></div>' +
      '<div class="field"><label class="field-label" for="team-role">' + escHtml(t('team_role_label')) + '</label>' +
        '<select class="input" id="team-role">' + roles.map(function (r) { return '<option value="' + r + '"' + (r === 'staff' ? ' selected' : '') + '>' + escHtml(t('role_' + r)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field team-add-btn"><button type="submit" class="btn btn-outline btn-lg"' + (st.adding ? ' disabled' : '') + '>' +
        escHtml(st.adding ? t('admin_processing') : t('team_add_btn')) + '</button></div></form>';
  },

  staffStatusBadge: function (status) {
    return '<span class="badge staff-status staff-status-' + escHtml(status) + '">' + escHtml(t(cncMemberStatusKey(status))) + '</span>';
  },

  staffListHtml: function () {
    var self = this;
    var me = APP.user && APP.user.id;
    var rows = this.staffMenu.rows;
    var roles = this.team.reps ? TEAM_ROLES : ADMIN_ROLES;
    if (!rows.length) return '<p class="muted">' + escHtml(t('staff_none')) + '</p>';
    return '<ul class="staff-list">' + rows.map(function (m) {
      var isMe = m.user_id === me;
      var id = escHtml(m.user_id);
      var roleSel = isMe ? '<span class="role-chip role-' + escHtml(m.role) + '">' + escHtml(t('role_' + m.role)) + '</span>'
        : '<select class="input team-role-select" aria-label="' + escHtml(t('team_role_label')) + '" onchange="PageAdmin.changeRole(\'' + id + '\', this)">' +
          roles.map(function (r) { return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + escHtml(t('role_' + r)) + '</option>'; }).join('') + '</select>';
      var actions = [];
      if (m.status === 'pending') actions.push('<button type="button" class="btn btn-primary btn-sm" onclick="PageAdmin.confirmMember(\'' + id + '\')">' + escHtml(t('staff_confirm_btn')) + '</button>');
      if (m.sales_rep || m.clients) actions.push('<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.openRepClients(\'' + id + '\')">' + escHtml(tf('staff_clients_btn', { n: m.clients || 0 })) + '</button>');
      if (!isMe) actions.push(m.status === 'suspended'
        ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.setMemberActive(\'' + id + '\', true)">' + escHtml(t('staff_reactivate_btn')) + '</button>'
        : '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.setMemberActive(\'' + id + '\', false)">' + escHtml(t('staff_suspend_btn')) + '</button>');
      actions.push('<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.renameMember(\'' + id + '\')">' + escHtml(t('team_rename')) + '</button>');
      if (m.account_type !== 'staff' && m.role !== 'owner' && !isMe) {
        actions.push('<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.convertToStaff(\'' + id + '\')">' + escHtml(t('staff_convert_btn')) + '</button>');
      }
      if (!isMe) actions.push('<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.removeMember(\'' + id + '\')">' + escHtml(t('team_remove')) + '</button>');
      return '<li class="staff-item staff-' + escHtml(m.status) + '" data-member="' + id + '">' +
        '<div class="staff-item-head"><b class="team-name">' + escHtml(m.name || m.email) + '</b>' + (isMe ? ' <span class="badge">' + escHtml(t('team_you')) + '</span>' : '') +
          ' ' + self.staffStatusBadge(m.status) +
          (m.account_type === 'staff' ? ' <span class="badge staff-acc-badge">' + escHtml(t('staff_account')) + '</span>' : ' <span class="badge">' + escHtml(t('staff_customer_account')) + '</span>') + '</div>' +
        '<div class="staff-item-grid">' +
          '<p><span class="muted">' + escHtml(t('email_label')) + '</span> ' + escHtml(m.email || '—') + '</p>' +
          '<p><span class="muted">' + escHtml(t('phone_label')) + '</span> <span class="mono">' + escHtml(m.phone || '—') + '</span></p>' +
          '<p><span class="muted">' + escHtml(t('team_role_label')) + '</span> ' + roleSel + '</p>' +
          '<p><span class="muted">' + escHtml(t('admin_joined')) + '</span> ' + escHtml(formatDate(m.created_at)) + (m.via_invite ? ' · ' + escHtml(t('staff_via_invite')) : '') + '</p>' +
          '<p><span class="muted">' + escHtml(t('staff_last_login')) + '</span> ' + escHtml(m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : '—') + '</p>' +
          (self.team.reps ? '<div class="team-sales-cell">' + self.teamSalesCellHtml(m) + '</div>' : '') +
        '</div>' +
        '<div class="btn-row staff-actions">' + actions.join('') + '</div></li>';
    }).join('') + '</ul>';
  },

  inviteListHtml: function () {
    var rows = this.staffMenu.invites || [];
    if (!rows.length) return '<p class="muted">' + escHtml(t('staff_invites_none')) + '</p>';
    return '<div class="table-wrap"><table class="table staff-invites-table"><thead><tr>' +
      '<th>' + escHtml(t('team_role_label')) + '</th><th>' + escHtml(t('staff_invite_note')) + '</th><th>' + escHtml(t('staff_invite_created')) + '</th>' +
      '<th>' + escHtml(t('staff_invite_expires')) + '</th><th>' + escHtml(t('col_status')) + '</th><th></th></tr></thead><tbody>' +
      rows.map(function (i) {
        return '<tr><td><span class="role-chip role-' + escHtml(i.role) + '">' + escHtml(t('role_' + i.role)) + '</span></td>' +
          '<td>' + escHtml(i.note || '—') + '</td><td class="nowrap">' + escHtml(formatDateTime(i.created_at)) + '</td>' +
          '<td class="nowrap">' + escHtml(formatDateTime(i.expires_at)) + '</td>' +
          '<td><span class="badge invite-' + escHtml(i.status) + '">' + escHtml(t(cncInviteStatusKey(i.status))) + '</span>' +
            (i.status === 'used' && i.used_by_name ? ' <span class="muted">' + escHtml(i.used_by_name) + '</span>' : '') + '</td>' +
          '<td>' + (i.status === 'waiting' ? '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.revokeInvite(' + Number(i.id) + ')">' + escHtml(t('staff_invite_revoke')) + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  // ---------- 초대 링크 만들기 ----------
  openInviteModal: function () {
    var self = this;
    var modal = uiModal({
      title: t('staff_invite_btn'),
      body: '<div class="field"><label class="field-label" for="inv-role">' + escHtml(t('team_role_label')) + '</label>' +
          '<select class="input" id="inv-role">' + STAFF_INVITE_ROLES.map(function (r) { return '<option value="' + r + '">' + escHtml(t('role_' + r)) + '</option>'; }).join('') + '</select>' +
          '<p class="field-help">' + escHtml(t('staff_invite_manager_note')) + '</p></div>' +
        '<div class="field"><label class="field-label" for="inv-hours">' + escHtml(t('staff_invite_hours')) + '</label>' +
          '<select class="input" id="inv-hours">' + STAFF_INVITE_HOURS.map(function (h) { return '<option value="' + h + '"' + (h === 48 ? ' selected' : '') + '>' + escHtml(tf('staff_hours_n', { n: h })) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="field-label" for="inv-note">' + escHtml(t('staff_invite_note')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
          '<input class="input" id="inv-note" maxlength="100" placeholder="' + escHtml(t('staff_invite_note_ph')) + '"></div>' +
        '<div id="inv-result"></div>',
      actions: [
        { label: t('btn_close'), kind: 'outline' },
        { label: t('staff_invite_create'), kind: 'primary', onClick: async function (close, btn) {
          btn.disabled = true;
          try {
            var r = await cncAdminCreateStaffInvite(modal.el.querySelector('#inv-role').value, modal.el.querySelector('#inv-hours').value, modal.el.querySelector('#inv-note').value);
            var link = cncInviteLink(r.token);
            modal.el.querySelector('#inv-result').innerHTML = '<div class="notice notice-success invite-result" role="status">' +
              '<p><b>' + escHtml(tf('staff_invite_ready', { role: t('role_' + r.role) })) + '</b></p>' +
              '<p class="invite-link mono" id="inv-link">' + escHtml(link) + '</p>' +
              '<button type="button" class="btn btn-primary" id="inv-copy">' + escHtml(t('staff_invite_copy')) + '</button>' +
              '<p class="field-help">' + escHtml(tf('staff_invite_once', { n: r.hours })) + '</p>' +
              '<p class="field-help"><b>' + escHtml(t('staff_invite_no_again')) + '</b></p></div>';
            modal.el.querySelector('#inv-copy').addEventListener('click', function () { self.copyText(link); });
            btn.hidden = true;   // 같은 창에서 또 만들지 않게 (새로 만들려면 창을 다시 열어요)
            self.loadTeam();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  copyText: async function (text) {
    try { await navigator.clipboard.writeText(text); uiToast(t('staff_invite_copied'), 'success'); }
    catch (e) { uiToast(text, 'info'); }
  },

  revokeInvite: async function (id) {
    var ok = await uiConfirm({ title: t('staff_invite_revoke'), message: t('staff_invite_revoke_confirm'), okLabel: t('staff_invite_revoke'), danger: true });
    if (!ok) return;
    try { await cncAdminRevokeStaffInvite(id); uiToast(t('staff_invite_revoked_toast'), 'success'); }
    catch (err) { console.error(err); uiToast(uiErrorMessage(err), 'error'); }
    this.loadTeam();
  },

  // ---------- 확인 · 정지 · 전환 ----------
  staffById: function (id) {
    return (this.staffMenu.rows || []).filter(function (m) { return m.user_id === id; })[0] || null;
  },

  confirmMember: async function (id) {
    var m = this.staffById(id);
    var ok = await uiConfirm({ title: t('staff_confirm_btn'), message: tf('staff_confirm_msg', { name: m ? m.name : '', role: m ? t('role_' + m.role) : '' }), okLabel: t('staff_confirm_btn') });
    if (!ok) return;
    try { await cncAdminConfirmMember(id); uiToast(t('staff_confirmed_toast'), 'success'); }
    catch (err) { console.error(err); uiToast(uiErrorMessage(err), 'error'); }
    this.loadTeam();
  },

  // 정지: 영업이고 거래처가 있으면 "담당 없음으로 / 다른 영업에게" 고르기
  setMemberActive: function (id, active) {
    var self = this;
    var m = this.staffById(id);
    if (!m) return;
    if (active) {
      uiConfirm({ title: t('staff_reactivate_btn'), message: tf('staff_reactivate_msg', { name: m.name }), okLabel: t('staff_reactivate_btn') }).then(async function (ok) {
        if (!ok) return;
        try { await cncAdminSetMemberActive(id, true, null); uiToast(t('staff_reactivated_toast'), 'success'); }
        catch (err) { uiToast(uiErrorMessage(err), 'error'); }
        self.loadTeam();
      });
      return;
    }
    var others = cncActiveReps(this.team.reps || []).filter(function (r) { return r.rep_id !== id; });
    var clientsPart = m.clients ? '<p class="modal-text">' + escHtml(tf('staff_suspend_clients', { n: m.clients })) + '</p>' +
      '<label class="check-line"><input type="radio" name="sus-move" value="" checked> ' + escHtml(t('staff_clients_unassign')) + '</label>' +
      (others.length ? '<label class="check-line"><input type="radio" name="sus-move" value="move"> ' + escHtml(t('staff_clients_move_to')) + '</label>' +
        '<select class="input" id="sus-rep">' + others.map(function (r) { return '<option value="' + escHtml(r.rep_id) + '">' + escHtml(r.name) + '</option>'; }).join('') + '</select>' : '') : '';
    var modal = uiModal({
      title: t('staff_suspend_btn'),
      body: '<p class="modal-text">' + escHtml(tf('staff_suspend_msg', { name: m.name })) + '</p>' + clientsPart,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('staff_suspend_btn'), kind: 'danger', onClick: async function (close, btn) {
          var move = modal.el.querySelector('input[name="sus-move"]:checked');
          var to = move && move.value === 'move' ? modal.el.querySelector('#sus-rep').value : null;
          btn.disabled = true;
          try {
            var r = cncParseJson(await cncAdminSetMemberActive(id, false, to)) || {};
            close();
            uiToast(tf('staff_suspended_toast', { n: Number(r.moved) || 0 }), 'success');
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
            return;
          }
          self.loadTeam();
        } }
      ]
    });
  },

  convertToStaff: async function (id) {
    var m = this.staffById(id);
    var ok = await uiConfirm({ title: t('staff_convert_btn'), message: tf('staff_convert_msg', { name: m ? m.name : '' }), okLabel: t('staff_convert_btn') });
    if (!ok) return;
    try { await cncAdminConvertToStaff(id); uiToast(t('staff_converted_toast'), 'success'); }
    catch (err) { console.error(err); uiToast(uiErrorMessage(err), 'error'); }
    this.loadTeam();
  },

  // ---------- 영업 담당 거래처 보기 · 옮기기 (여러 곳 한꺼번에) ----------
  openRepClients: async function (id) {
    var self = this;
    var m = this.staffById(id);
    var modal = uiModal({ title: tf('staff_clients_title', { name: m ? m.name : '' }), body: uiLoading(), wide: true });
    var rows;
    try { rows = await cncAdminRepClients(id); }
    catch (err) { modal.el.querySelector('.modal-body').innerHTML = '<p class="error-text">' + escHtml(uiErrorMessage(err)) + '</p>'; return; }
    var others = cncActiveReps(this.team.reps || []).filter(function (r) { return r.rep_id !== id; });
    var body = modal.el.querySelector('.modal-body');
    if (!rows.length) { body.innerHTML = '<p class="muted">' + escHtml(t('sales_no_clients')) + '</p>'; return; }
    body.innerHTML = '<label class="check-line"><input type="checkbox" id="rc-all"> ' + escHtml(t('tax_pick_all')) + '</label>' +
      '<ul class="rep-clients">' + rows.map(function (c) {
        return '<li><label class="check-line"><input type="checkbox" class="rc-pick" value="' + escHtml(c.user_id) + '"> <b>' + escHtml(c.clinic || '') + '</b> · ' +
          escHtml(c.name || '') + ' · <span class="mono">' + escHtml(c.phone || '') + '</span></label></li>';
      }).join('') + '</ul>' +
      '<div class="form-grid two rep-move-row"><div class="field"><label class="field-label" for="rc-to">' + escHtml(t('staff_clients_move_to')) + '</label>' +
        '<select class="input" id="rc-to"><option value="">' + escHtml(t('staff_clients_unassign')) + '</option>' +
        others.map(function (r) { return '<option value="' + escHtml(r.rep_id) + '">' + escHtml(r.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field team-add-btn"><button type="button" class="btn btn-primary" id="rc-move">' + escHtml(t('staff_clients_move_btn')) + '</button></div></div>';
    body.querySelector('#rc-all').addEventListener('change', function () {
      var on = this.checked;
      body.querySelectorAll('.rc-pick').forEach(function (b) { b.checked = on; });
    });
    body.querySelector('#rc-move').addEventListener('click', async function () {
      var ids = Array.prototype.map.call(body.querySelectorAll('.rc-pick:checked'), function (b) { return b.value; });
      if (!ids.length) { uiToast(t('staff_clients_pick_one'), 'error'); return; }
      this.disabled = true;
      try {
        var n = await cncAdminMoveClients(ids, body.querySelector('#rc-to').value || null);
        modal.close();
        uiToast(tf('staff_clients_moved', { n: Number(n) || 0 }), 'success');
        self.loadTeam();
      } catch (err) {
        console.error(err);
        this.disabled = false;
        uiToast(uiErrorMessage(err), 'error');
      }
    });
  }
});
