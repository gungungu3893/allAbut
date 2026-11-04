// ================================================================
// allAbut — 관리자 화면: Team(팀) · Activity(작업 기록) · Settings 의 LINE groups
// ================================================================
// page-admin.js 의 PageAdmin 에 함수를 덧붙여요 (이 파일은 page-admin.js 다음에 불러와요).
// 로직(DB 호출)은 cnc/cnc-team.js 에 있어요.
//   Team      (owner)    : 멤버 목록 · 추가(가입한 이메일만) · 역할 변경 · 이름 변경 · 제거
//   Activity  (staff 이상): admin_audit_log 최신순, 처리자·작업·대상 필터
//   LINE groups (owner)  : 연결된 그룹(카테고리·켜기/끄기·삭제) + 그룹 연결 코드(30분, 5초마다 연결 확인)

Object.assign(PageAdmin, {

  team: { rows: null, error: false, adding: false, errors: {} },
  activity: { rows: [], hasMore: false, loading: false, error: false, actor: '', group: '', target: '', actors: {} },
  lineGroups: { targets: null, error: false, code: null, expiresAt: null, linked: false, expired: false },
  lineGroupTimers: { poll: null, tick: null },

  // 이름 · 날짜 도구
  roleLabel: function (role) {
    return t('role_' + role);
  },

  // ================================================================
  // Team (owner)
  // ================================================================
  loadTeam: async function () {
    var st = this.team;
    var token = ++this.loadToken;
    st.error = false;
    this.drawBody();
    try {
      var rows = await cncAdminListTeam();
      if (token !== this.loadToken) return;
      st.rows = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  teamHtml: function () {
    var st = this.team;
    if (st.error) return this.errorBox('PageAdmin.loadTeam()', st.error);
    var me = APP.user && APP.user.id;
    var site = (typeof SITE_URL === 'string' ? SITE_URL : 'https://allabut.com').replace(/^https?:\/\//, '');

    function roleOptions(selected) {
      return ADMIN_ROLES.map(function (r) {
        return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>' + escHtml(t('role_' + r)) + '</option>';
      }).join('');
    }

    // 멤버 추가
    var add = '<section class="card">' +
      '<h2 class="card-title">' + escHtml(t('team_add_title')) + '</h2>' +
      '<p class="notice-inline"><span aria-hidden="true">ℹ</span> ' + escHtml(tf('team_add_signup_first', { site: site })) + '</p>' +
      '<form class="form-grid two" onsubmit="PageAdmin.addMember(event)" novalidate>' +
        '<div class="field"><label class="field-label" for="team-email">' + escHtml(t('email_label')) + '</label>' +
          '<input class="input" id="team-email" type="email" autocomplete="off" maxlength="200">' +
          '<div class="err-slot" data-err="team-email">' + (st.errors.email ? uiFieldError(st.errors.email) : '') + '</div></div>' +
        '<div class="field"><label class="field-label" for="team-name">' + escHtml(t('team_name_label')) + '</label>' +
          '<input class="input" id="team-name" type="text" maxlength="60" placeholder="' + escHtml(t('team_name_placeholder')) + '">' +
          '<p class="field-help">' + escHtml(t('team_name_help')) + '</p></div>' +
        '<div class="field"><label class="field-label" for="team-role">' + escHtml(t('team_role_label')) + '</label>' +
          '<select class="input" id="team-role">' + roleOptions('staff') + '</select></div>' +
        '<div class="field team-add-btn"><button type="submit" class="btn btn-primary btn-lg"' + (st.adding ? ' disabled' : '') + '>' +
          escHtml(st.adding ? t('admin_processing') : t('team_add_btn')) + '</button></div>' +
      '</form>' +
      '<div class="role-legend">' + ADMIN_ROLES.map(function (r) {
        return '<p><span class="role-chip role-' + r + '">' + escHtml(t('role_' + r)) + '</span> ' + escHtml(t('role_desc_' + r)) + '</p>';
      }).join('') + '</div>' +
      '</section>';

    // 멤버 목록
    var list;
    if (!st.rows) list = uiLoading();
    else list = '<div class="table-wrap"><table class="table team-table"><thead><tr>' +
      '<th>' + escHtml(t('email_label')) + '</th><th>' + escHtml(t('team_name_label')) + '</th><th>' + escHtml(t('team_role_label')) + '</th>' +
      '<th>' + escHtml(t('team_added')) + '</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (m) {
        var self = m.user_id === me;
        return '<tr data-member="' + escHtml(m.user_id) + '">' +
          '<td class="team-email">' + escHtml(m.email) + (self ? ' <span class="badge">' + escHtml(t('team_you')) + '</span>' : '') + '</td>' +
          '<td><span class="team-name">' + escHtml(m.display_name || '—') + '</span> ' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.renameMember(\'' + escHtml(m.user_id) + '\')">' + escHtml(t('team_rename')) + '</button></td>' +
          '<td><select class="input team-role-select" aria-label="' + escHtml(t('team_role_label')) + '" onchange="PageAdmin.changeRole(\'' + escHtml(m.user_id) + '\', this)">' + roleOptions(m.role) + '</select></td>' +
          '<td class="nowrap">' + escHtml(formatDate(m.created_at)) + (m.added_by_name ? '<br><span class="muted">' + escHtml(tf('team_added_by', { name: m.added_by_name })) + '</span>' : '') + '</td>' +
          '<td>' + (self ? '' : '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.removeMember(\'' + escHtml(m.user_id) + '\')">' + escHtml(t('team_remove')) + '</button>') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';

    return '<div class="admin-team">' + add +
      '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('team_members')) + '</h2>' +
        (st.rows ? '<span class="muted">' + escHtml(tf('team_count', { n: st.rows.length })) + '</span>' : '') + '</div>' + list + '</section>' +
      '</div>';
  },

  memberById: function (id) {
    return (this.team.rows || []).filter(function (m) { return m.user_id === id; })[0] || null;
  },

  addMember: async function (event) {
    event.preventDefault();
    var st = this.team;
    if (st.adding) return;
    var email = (document.getElementById('team-email').value || '').trim();
    var name = (document.getElementById('team-name').value || '').trim();
    var role = document.getElementById('team-role').value;
    st.errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      st.errors.email = t('err_email_invalid');
      this.drawBody();
      document.getElementById('team-email').value = email;
      document.getElementById('team-name').value = name;
      document.getElementById('team-role').value = role;
      document.getElementById('team-email').focus();
      return;
    }
    st.adding = true;
    this.drawBody();
    try {
      await cncAdminAddMember(email, role, name);
      st.adding = false;
      uiToast(tf('team_added_toast', { email: email, role: t('role_' + role) }), 'success');
      this.loadTeam();
    } catch (err) {
      console.error(err);
      st.adding = false;
      if (cncErrorCode(err) === 'USER_NOT_FOUND' || cncErrorCode(err) === 'ALREADY_MEMBER') st.errors.email = uiErrorMessage(err);
      else uiToast(uiErrorMessage(err), 'error');
      this.drawBody();
      var e1 = document.getElementById('team-email'); if (e1) e1.value = email;
      var e2 = document.getElementById('team-name'); if (e2) e2.value = name;
      var e3 = document.getElementById('team-role'); if (e3) e3.value = role;
    }
  },

  changeRole: async function (userId, select) {
    var m = this.memberById(userId);
    if (!m) return;
    var role = select.value;
    if (role === m.role) return;
    var isMe = APP.user && userId === APP.user.id;
    var ok = await uiConfirm({
      title: t('team_change_role'),
      message: tf(isMe ? 'team_change_role_self' : 'team_change_role_confirm', { name: m.display_name || m.email, role: t('role_' + role) }),
      okLabel: t('team_change_role')
    });
    if (!ok) { select.value = m.role; return; }
    select.disabled = true;
    try {
      await cncAdminSetRole(userId, role);
      uiToast(t('team_role_changed'), 'success');
      if (isMe) { await this.reloadMyRole(); return; }
      this.loadTeam();
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
      select.disabled = false;
      select.value = m.role;
    }
  },

  // 내 역할이 바뀌면 헤더·탭을 다시 그려요
  reloadMyRole: async function () {
    var me = await cncLoadAdminMe();
    APP.adminRole = me ? me.role : null;
    APP.adminName = me ? me.name : '';
    APP.isAdmin = !!APP.adminRole;
    renderLayout();
    if (!APP.isAdmin) { location.hash = '#/home'; return; }
    history.replaceState(null, '', '#/admin/orders');
    this.render(this.main);
  },

  renameMember: function (userId) {
    var self = this;
    var m = this.memberById(userId);
    if (!m) return;
    uiModal({
      title: t('team_rename'),
      body: '<div class="field"><label class="field-label" for="team-rename">' + escHtml(t('team_name_label')) + '</label>' +
        '<input class="input" id="team-rename" type="text" maxlength="60" value="' + escHtml(m.display_name || '') + '">' +
        '<p class="field-help">' + escHtml(t('team_name_help')) + '</p></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('pe_save'), kind: 'primary', onClick: async function (close, btn) {
          var v = (document.getElementById('team-rename').value || '').trim();
          btn.disabled = true;
          try {
            await cncAdminSetMemberName(userId, v);
            close();
            uiToast(t('team_renamed'), 'success');
            if (APP.user && userId === APP.user.id) APP.adminName = v || APP.adminName;
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

  removeMember: async function (userId) {
    var m = this.memberById(userId);
    if (!m) return;
    var ok = await uiConfirm({
      title: t('team_remove'),
      message: tf('team_remove_confirm', { name: m.display_name || m.email }),
      okLabel: t('team_remove'),
      danger: true
    });
    if (!ok) return;
    try {
      await cncAdminRemoveMember(userId);
      uiToast(t('team_removed'), 'success');
      this.loadTeam();
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
  },

  // ================================================================
  // Activity (staff 이상)
  // ================================================================
  loadActivity: async function (more) {
    var st = this.activity;
    var token = ++this.loadToken;
    st.loading = true;
    st.error = false;
    if (!more) { st.rows = []; st.hasMore = false; }
    if (!more) this.drawBody(); else this.drawActivityList();
    try {
      var last = more && st.rows.length ? st.rows[st.rows.length - 1].created_at : null;
      var res = await cncAdminListAudit({ actor: st.actor, group: st.group, target: st.target, before: last });
      if (token !== this.loadToken) return;
      st.rows = more ? st.rows.concat(res.rows) : res.rows;
      st.hasMore = res.hasMore;
      res.rows.forEach(function (r) { if (r.actor_id) st.actors[r.actor_id] = r.actor_name || r.actor_id.slice(0, 8); });
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    st.loading = false;
    if (more) this.drawActivityList(); else this.drawBody();
  },

  activityHtml: function () {
    var st = this.activity;
    var actors = Object.keys(st.actors).map(function (id) { return { id: id, name: st.actors[id] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var groups = ['orders', 'topups', 'credits', 'team', 'settings'];
    var tools = '<div class="activity-tools card">' +
      '<div class="field"><label class="field-label" for="act-actor">' + escHtml(t('audit_filter_actor')) + '</label>' +
        '<select class="input" id="act-actor" onchange="PageAdmin.setActivityFilter(\'actor\', this.value)">' +
          '<option value="">' + escHtml(t('audit_all')) + '</option>' +
          actors.map(function (a) { return '<option value="' + escHtml(a.id) + '"' + (st.actor === a.id ? ' selected' : '') + '>' + escHtml(a.name) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="field"><label class="field-label" for="act-group">' + escHtml(t('audit_filter_action')) + '</label>' +
        '<select class="input" id="act-group" onchange="PageAdmin.setActivityFilter(\'group\', this.value)">' +
          '<option value="">' + escHtml(t('audit_all')) + '</option>' +
          groups.map(function (g) { return '<option value="' + g + '"' + (st.group === g ? ' selected' : '') + '>' + escHtml(t('audit_group_' + g)) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="field"><label class="field-label" for="act-target">' + escHtml(t('audit_filter_target')) + '</label>' +
        '<input class="input" id="act-target" type="search" value="' + escHtml(st.target) + '" placeholder="' + escHtml(t('audit_target_placeholder')) + '" ' +
          'oninput="PageAdmin.onActivitySearch(this.value)"></div>' +
      '</div>';
    return '<div class="admin-activity">' + tools + '<section class="card" id="activity-list"></section></div>';
  },

  // activityHtml 을 그린 뒤 목록 채우기 (drawBody 가 innerHTML 로 넣기 때문에 여기서 따로)
  drawActivityList: function () {
    var box = document.getElementById('activity-list');
    if (!box) return;
    var st = this.activity;
    var self = this;
    if (st.error) { box.innerHTML = this.errorBox('PageAdmin.loadActivity()', st.error); return; }
    if (!st.rows.length && st.loading) { box.innerHTML = uiLoading(); return; }
    if (!st.rows.length) { box.innerHTML = '<p class="empty-text">' + escHtml(t('audit_empty')) + '</p>'; return; }
    box.innerHTML = '<ol class="audit-list">' + st.rows.map(function (r) {
      return '<li class="audit-item audit-' + escHtml(String(r.action).split('_')[0]) + '">' +
        '<div class="audit-head">' +
          '<span class="audit-time mono">' + escHtml(formatDateTime(r.created_at)) + '</span>' +
          '<span class="audit-actor"><span aria-hidden="true">👤</span> ' + escHtml(r.actor_name || '—') + '</span>' +
        '</div>' +
        '<p class="audit-what"><b>' + escHtml(self.auditLabel(r.action)) + '</b> ' + self.auditTargetHtml(r) + '</p>' +
        (self.auditDetail(r) ? '<p class="audit-detail muted">' + escHtml(self.auditDetail(r)) + '</p>' : '') +
        '</li>';
    }).join('') + '</ol>' +
      (st.hasMore ? '<button type="button" class="btn btn-outline btn-block" onclick="PageAdmin.loadActivity(true)"' + (st.loading ? ' disabled' : '') + '>' +
        escHtml(st.loading ? t('loading') : t('load_more')) + '</button>' : '');
  },

  auditLabel: function (action) {
    var k = 'audit_' + action;
    var v = t(k);
    return v === k ? action : v;
  },

  auditTargetHtml: function (r) {
    if (!r.target_id) return '';
    if (r.target_type === 'order') {
      return '<button type="button" class="link-btn mono" onclick="PageAdmin.openOrder(\'' + escHtml(r.target_id) + '\')">' + escHtml(r.target_id) + '</button>';
    }
    if (r.target_type === 'topup' || r.target_type === 'line_group') return '<span class="mono">' + escHtml(r.target_id) + '</span>';
    if (r.target_type === 'member' || r.target_type === 'customer') {
      var d = r.detail || {};
      return '<span>' + escHtml(d.name || d.email || '') + '</span>';
    }
    return '<span class="muted">' + escHtml(r.target_type) + '</span>';
  },

  // 한 줄 설명 (사람이 읽기 쉽게)
  auditDetail: function (r) {
    var d = r.detail || {};
    function stage(s) { return s ? t('stage_' + s) : '—'; }
    switch (r.action) {
      case 'order_stage': case 'order_cancelled':
        return stage(d.from) + ' → ' + stage(d.to) + (d.clinic ? ' · ' + d.clinic : '') + (d.note ? ' · ' + d.note : '');
      case 'order_shipping':
        return [d.carrier, d.tracking_number].filter(Boolean).join(' ');
      case 'order_design':
        return 'v' + (d.version || '');
      case 'topup_approved':
        return tf('fin_credits_fmt', { n: formatNumber(d.credits || 0) }) + ' · ' + formatTHB(d.total || 0);
      case 'topup_rejected':
        return tf('fin_credits_fmt', { n: formatNumber(d.credits || 0) }) + ' · ' + formatTHB(d.total || 0) + (d.reason ? ' · ' + d.reason : '');
      case 'credits_added': case 'credits_removed':
        return (d.amount > 0 ? '+' : '') + formatNumber(d.amount || 0) + ' ' + t('credit_unit') + (d.description ? ' · ' + d.description : '');
      case 'refund_cash':
        return formatTHB(d.amount_thb || 0) + ' · ' + formatNumber(Math.abs(d.credits || 0)) + ' ' + t('credit_unit');
      case 'team_add':
        return (d.email || '') + ' · ' + t('role_' + (d.role || 'staff'));
      case 'team_role':
        return t('role_' + d.from) + ' → ' + t('role_' + d.to);
      case 'team_remove':
        return d.role ? t('role_' + d.role) : '';
      case 'settings_changed':
        return t('audit_table_' + r.target_type) + (Array.isArray(d.changed) && d.changed.length ? ' · ' + d.changed.join(', ') : (d.op ? ' · ' + d.op : ''));
      default:
        return '';
    }
  },

  setActivityFilter: function (field, value) {
    this.activity[field] = value;
    this.loadActivity(false);
  },

  onActivitySearch: function (value) {
    var self = this;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(function () {
      self.activity.target = value;
      self.loadActivityKeepFocus();
    }, 350);
  },

  // 검색칸 글자를 치는 중에 다시 그려도 커서가 그대로 있게
  loadActivityKeepFocus: async function () {
    await this.loadActivity(false);
    var input = document.getElementById('act-target');
    if (input) { input.focus(); var n = input.value.length; try { input.setSelectionRange(n, n); } catch (e) { /* 무시 */ } }
  },

  // ================================================================
  // Settings → LINE groups (owner)
  // ================================================================
  loadLineGroups: async function () {
    var lg = this.lineGroups;
    lg.error = false;
    try {
      lg.targets = await cncAdminListNotifyTargets();
    } catch (err) {
      console.error(err);
      lg.error = err;
    }
    this.drawLineGroups();
  },

  drawLineGroups: function () {
    var box = document.getElementById('line-groups');
    if (!box) return;
    var lg = this.lineGroups;
    if (lg.targets === null && !lg.error) { box.innerHTML = '<h2 class="card-title">' + escHtml(t('lg_title')) + '</h2>' + uiLoading(); this.loadLineGroups(); return; }
    var botId = (typeof LINE_ADD_FRIEND_URL === 'string' ? LINE_ADD_FRIEND_URL.split('/').pop() : '');

    var html = '<div class="card-head"><h2 class="card-title"><span class="line-logo" aria-hidden="true">LINE</span> ' + escHtml(t('lg_title')) + '</h2>' +
      '<button type="button" class="btn btn-line" onclick="PageAdmin.createGroupCode()">' + escHtml(t('lg_create_code')) + '</button></div>' +
      '<p class="card-desc">' + escHtml(t('lg_desc')) + '</p>';

    // 코드 상자
    if (lg.code) {
      if (lg.linked) {
        html += '<div class="lg-code-box lg-linked" role="status"><p class="lg-linked-text"><span aria-hidden="true">✅</span> ' + escHtml(t('lg_linked')) + '</p></div>';
      } else if (lg.expired) {
        html += '<div class="lg-code-box lg-expired" role="status"><p><span aria-hidden="true">⌛</span> ' + escHtml(t('lg_code_expired')) + '</p>' +
          '<button type="button" class="btn btn-primary" onclick="PageAdmin.createGroupCode()">' + escHtml(t('lg_create_code')) + '</button></div>';
      } else {
        html += '<div class="lg-code-box">' +
          '<div class="lg-code-main"><p class="lg-code mono">' + escHtml(lg.code) + '</p>' +
            '<p class="lg-countdown">' + escHtml(t('lg_expires_in')) + ' <b class="mono" id="lg-countdown">' + escHtml(this.groupCountdownText()) + '</b></p>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.copyGroupCode()"><span aria-hidden="true">📋</span> ' + escHtml(t('line_copy')) + '</button></div>' +
          '<ol class="lg-steps">' +
            '<li><span class="line-step-num mono">1</span><p>' + escHtml(t('lg_step1')) + '</p></li>' +
            '<li><span class="line-step-num mono">2</span><p>' + escHtml(tf('lg_step2', { id: botId })) + '</p></li>' +
            '<li><span class="line-step-num mono">3</span><p>' + escHtml(tf('lg_step3', { code: lg.code })) + '</p></li>' +
          '</ol>' +
          '<p class="line-auto" role="status"><span class="line-auto-dot" aria-hidden="true"></span> ' + escHtml(t('lg_waiting')) + '</p>' +
          '</div>';
      }
    }

    // 연결된 그룹 목록
    if (lg.error) {
      html += '<p class="error-text"><span aria-hidden="true">⚠</span> ' + escHtml(uiErrorMessage(lg.error)) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadLineGroups()">' + escHtml(t('btn_retry')) + '</button>';
    } else if (!lg.targets.length) {
      html += '<p class="empty-text">' + escHtml(t('lg_empty')) + '</p>';
    } else {
      html += '<ul class="lg-list">' + lg.targets.map(function (g) {
        var cats = Array.isArray(g.categories) ? g.categories : [];
        return '<li class="lg-item' + (g.active ? '' : ' lg-off') + '">' +
          '<div class="lg-item-head">' +
            '<p class="lg-name"><b>' + escHtml(g.name || t('lg_unnamed')) + '</b> <span class="muted">· ' + escHtml(t(g.kind === 'user' ? 'lg_kind_user' : 'lg_kind_group')) + ' · ' + escHtml(formatDate(g.created_at)) + '</span></p>' +
            '<label class="checkbox lg-active"><input type="checkbox"' + (g.active ? ' checked' : '') + ' onchange="PageAdmin.toggleGroupActive(' + g.id + ', this.checked)"> <span>' + escHtml(t('lg_on')) + '</span></label>' +
          '</div>' +
          '<div class="lg-cats" role="group" aria-label="' + escHtml(t('lg_categories')) + '">' +
            NOTIFY_CATEGORIES.map(function (c) {
              return '<label class="checkbox"><input type="checkbox"' + (cats.indexOf(c) !== -1 ? ' checked' : '') + ' onchange="PageAdmin.toggleGroupCategory(' + g.id + ', \'' + c + '\', this.checked)"> <span>' + escHtml(t('lg_cat_' + c)) + '</span></label>';
            }).join('') +
          '</div>' +
          '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.deleteGroup(' + g.id + ')">' + escHtml(t('lg_delete')) + '</button>' +
          '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  },

  groupById: function (id) {
    return (this.lineGroups.targets || []).filter(function (g) { return g.id === id; })[0] || null;
  },

  toggleGroupActive: async function (id, on) {
    var g = this.groupById(id);
    if (!g) return;
    try {
      await cncAdminUpdateNotifyTarget(id, { active: on });
      g.active = on;
      uiToast(t(on ? 'lg_turned_on' : 'lg_turned_off'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawLineGroups();
  },

  toggleGroupCategory: async function (id, cat, on) {
    var g = this.groupById(id);
    if (!g) return;
    var cats = (g.categories || []).filter(function (c) { return c !== cat; });
    if (on) cats.push(cat);
    cats = NOTIFY_CATEGORIES.filter(function (c) { return cats.indexOf(c) !== -1; });
    try {
      await cncAdminUpdateNotifyTarget(id, { categories: cats });
      g.categories = cats;
      uiToast(t('lg_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawLineGroups();
  },

  deleteGroup: async function (id) {
    var g = this.groupById(id);
    if (!g) return;
    var ok = await uiConfirm({ title: t('lg_delete'), message: tf('lg_delete_confirm', { name: g.name || t('lg_unnamed') }), okLabel: t('lg_delete'), danger: true });
    if (!ok) return;
    try {
      await cncAdminDeleteNotifyTarget(id);
      this.lineGroups.targets = this.lineGroups.targets.filter(function (x) { return x.id !== id; });
      uiToast(t('lg_deleted'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawLineGroups();
  },

  // ----- 그룹 연결 코드 (30분, 5초마다 연결 확인) -----
  createGroupCode: async function () {
    var lg = this.lineGroups;
    this.stopGroupCode();
    try {
      var d = await cncAdminCreateGroupCode();
      lg.code = d.code;
      lg.expiresAt = d.expires_at ? new Date(d.expires_at).getTime() : Date.now() + 30 * 60000;
      lg.linked = false;
      lg.expired = false;
      this.drawLineGroups();
      this.startGroupCode();
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
  },

  groupCountdownText: function () {
    var left = Math.max(0, Math.round(((this.lineGroups.expiresAt || 0) - Date.now()) / 1000));
    return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  },

  copyGroupCode: async function () {
    var code = this.lineGroups.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      uiToast(t('line_copied'), 'success');
    } catch (e) {
      uiToast(t('line_copy_manual'), 'info');
    }
  },

  startGroupCode: function () {
    var self = this;
    var lg = this.lineGroups;
    // 1초마다 남은 시간
    this.lineGroupTimers.tick = setInterval(function () {
      if (!document.getElementById('line-groups')) { self.stopGroupCode(); return; }
      if (Date.now() >= lg.expiresAt) {
        lg.expired = true;
        self.stopGroupCode();
        self.drawLineGroups();
        return;
      }
      var el = document.getElementById('lg-countdown');
      if (el) el.textContent = self.groupCountdownText();
    }, 1000);
    // 5초마다 연결됐는지
    this.lineGroupTimers.poll = setInterval(async function () {
      if (!document.getElementById('line-groups')) { self.stopGroupCode(); return; }
      try {
        var s = await cncAdminGroupCodeStatus(lg.code);
        if (s.used) {
          lg.linked = true;
          self.stopGroupCode();
          uiToast(t('lg_linked'), 'success');
          lg.targets = null;                 // 목록 새로 불러오기
          self.drawLineGroups();
        }
      } catch (err) {
        console.warn('group code check failed', err);
      }
    }, GROUP_CODE_POLL_MS);
  },

  stopGroupCode: function () {
    if (this.lineGroupTimers.tick) clearInterval(this.lineGroupTimers.tick);
    if (this.lineGroupTimers.poll) clearInterval(this.lineGroupTimers.poll);
    this.lineGroupTimers.tick = null;
    this.lineGroupTimers.poll = null;
  }
});

// 관리자 화면을 떠나거나 탭을 바꾸면 그룹 코드 확인을 멈춰요
(function () {
  var leave = PageAdmin.leave;
  PageAdmin.leave = function () {
    this.stopGroupCode();
    return leave.apply(this, arguments);
  };
  var setTab = PageAdmin.setTab;
  PageAdmin.setTab = function (id) {
    if (id !== 'settings') this.stopGroupCode();
    return setTab.apply(this, arguments);
  };
  // Activity 탭: 틀을 그린 뒤 목록 채우기
  var drawBody = PageAdmin.drawBody;
  PageAdmin.drawBody = function () {
    var r = drawBody.apply(this, arguments);
    if (this.tab === 'activity') this.drawActivityList();
    return r;
  };
})();
