// ===== 관리자 화면 #/admin =====
// 탭 3개: Orders(주문 처리) / Customers(고객·크레딧) / Dashboard(현황)
// 주소: #/admin/orders, #/admin/customers, #/admin/dashboard (새로고침해도 같은 탭)
// 데이터 처리는 cnc/cnc-admin.js 가 하고, 이 파일은 화면만 그려요.

var PageAdmin = {
  main: null,
  tab: 'orders',
  loadToken: 0,

  // Orders 탭 상태
  orders: { stage: 'active', search: '', sort: 'newest', rows: [], hasMore: false, loading: false, error: false },
  // Dashboard 탭 상태
  dash: { data: null, error: false },
  // Customers 탭 상태
  users: { rows: null, search: '', error: false },

  // 열려 있는 주문 상세
  detail: null,     // { modal, id, order, profile, busy, progress, error }
  // 열려 있는 고객 상세
  customer: null,   // { modal, user, history, orders, busy }

  searchTimer: null,

  TABS: [
    { id: 'orders', key: 'admin_tab_orders' },
    { id: 'customers', key: 'admin_tab_customers' },
    { id: 'dashboard', key: 'admin_tab_dashboard' }
  ],

  // ================================================================
  // 페이지 열기 / 다시 그리기 / 떠나기
  // ================================================================
  render: function (main) {
    this.main = main;
    var m = /^#\/admin\/([a-z]+)/.exec(location.hash || '');
    this.tab = (m && this.TABS.some(function (x) { return x.id === m[1]; })) ? m[1] : 'orders';
    this.drawFrame();
    this.loadTab();
  },

  rerender: function () {
    this.drawFrame();
    this.drawBody();
    if (this.detail) this.drawDetail();
    if (this.customer) this.drawCustomer();
  },

  leave: function () {
    this.loadToken++;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.detail && this.detail.modal) this.detail.modal.close();
    if (this.customer && this.customer.modal) this.customer.modal.close();
    this.detail = null;
    this.customer = null;
  },

  // 제목 + 새로고침 + 탭
  drawFrame: function () {
    var self = this;
    this.main.innerHTML =
      '<div class="page page-admin">' +
        '<div class="page-head">' +
          '<h1 class="page-title"><span class="admin-badge admin-badge-lg">' + escHtml(t('nav_admin')) + '</span> ' + escHtml(t('admin_title')) + '</h1>' +
          '<button type="button" class="btn btn-outline" onclick="PageAdmin.refresh()"><span aria-hidden="true">↻</span> ' + escHtml(t('admin_refresh')) + '</button>' +
        '</div>' +
        '<div class="seg admin-tabs" role="tablist">' + this.TABS.map(function (x) {
          var on = self.tab === x.id;
          return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setTab(\'' + x.id + '\')">' + escHtml(t(x.key)) + '</button>';
        }).join('') + '</div>' +
        '<div id="admin-body"></div>' +
      '</div>';
  },

  setTab: function (id) {
    if (this.tab === id) return;
    this.tab = id;
    history.replaceState(null, '', '#/admin/' + id);   // 주소만 바꾸고 페이지는 다시 열지 않아요
    this.drawFrame();
    this.loadTab();
  },

  refresh: function () {
    this.loadTab();
    if (this.detail) this.loadDetail();
    if (this.customer) this.loadCustomer();
    uiToast(t('admin_refreshed'), 'success');
  },

  loadTab: function () {
    if (this.tab === 'orders') return this.loadOrders(false);
    if (this.tab === 'customers') return this.loadUsers();
    return this.loadDash();
  },

  drawBody: function () {
    var box = document.getElementById('admin-body');
    if (!box) return;
    if (this.tab === 'orders') box.innerHTML = this.ordersHtml();
    else if (this.tab === 'customers') box.innerHTML = this.usersHtml();
    else box.innerHTML = this.dashHtml();
  },

  errorBox: function (retryCall, err) {
    return '<div class="card"><p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' +
      escHtml(err ? uiErrorMessage(err) : t('load_error')) + '</p>' +
      '<button type="button" class="btn btn-outline" onclick="' + retryCall + '">' + escHtml(t('btn_retry')) + '</button></div>';
  },

  // 납기 칸 (임박·지남 색)
  dueHtml: function (o) {
    var state = cncDueState(o);
    var label = state === 'overdue' ? ' · ' + t('admin_overdue') : (state === 'soon' ? ' · ' + t('admin_due_soon_short') : '');
    return '<span class="due ' + state + '">' + escHtml(formatDate(o.deadline)) + escHtml(label) + '</span>';
  },

  // ================================================================
  // Dashboard 탭
  // ================================================================
  loadDash: async function () {
    var token = ++this.loadToken;
    this.dash.error = false;
    this.drawBody();
    try {
      var data = await cncAdminDashboard();
      if (token !== this.loadToken) return;
      this.dash.data = data;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.dash.error = err;
    }
    this.drawBody();
  },

  dashHtml: function () {
    var self = this;
    if (this.dash.error) return this.errorBox('PageAdmin.loadDash()', this.dash.error);
    var d = this.dash.data;
    if (!d) return '<div class="card">' + uiLoading() + '</div>';

    var stageCards = '<div class="admin-stage-cards">' + ADMIN_ACTIVE_STAGES.map(function (stage) {
      return '<button type="button" class="admin-stage-card stage-card-' + stage + '" onclick="PageAdmin.filterStage(\'' + stage + '\')">' +
        '<span class="admin-stage-count mono">' + formatNumber(d.counts[stage]) + '</span>' +
        '<span class="admin-stage-name">' + escHtml(t('stage_' + stage)) + '</span>' +
        '</button>';
    }).join('') + '</div>';

    var stats = '<div class="admin-stats">' +
      '<div class="card admin-stat"><span class="admin-stat-label">' + escHtml(t('admin_today_orders')) + '</span><span class="admin-stat-num mono">' + formatNumber(d.today) + '</span></div>' +
      '<div class="card admin-stat"><span class="admin-stat-label">' + escHtml(t('admin_month_orders')) + '</span><span class="admin-stat-num mono">' + formatNumber(d.month) + '</span></div>' +
      '<div class="card admin-stat"><span class="admin-stat-label">' + escHtml(t('admin_month_credits')) + '</span><span class="admin-stat-num mono">' + formatNumber(d.monthCredits) + '</span></div>' +
      '</div>';

    var due = '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('admin_due_soon')) + '</h2>' +
      '<span class="muted">' + escHtml(tf('admin_due_soon_desc', { n: ADMIN_DUE_DAYS })) + '</span></div>' +
      (d.due.length
        ? '<ul class="order-list">' + d.due.map(function (o) {
            return '<li><button type="button" class="order-row admin-due-row ' + cncDueState(o) + '" onclick="PageAdmin.openOrder(\'' + escHtml(o.id) + '\')">' +
              '<span class="order-row-id mono">' + escHtml(o.id) + '</span>' +
              '<span class="order-row-meta">' + self.dueHtml(o) + ' · ' + escHtml(o.clinic || '') + ' · ' + escHtml(o.patient || t('anonymous')) + ' · ' + escHtml(tf('teeth_count_fmt', { n: o.teeth_count })) + '</span>' +
              uiStageBadge(o.stage) + '</button></li>';
          }).join('') + '</ul>'
        : '<p class="empty-text">' + escHtml(t('admin_no_due')) + '</p>') +
      '</section>';

    return '<h2 class="section-label">' + escHtml(t('admin_by_stage')) + '</h2>' + stageCards + stats + due;
  },

  // 대시보드 카드 → Orders 탭에서 그 단계만
  filterStage: function (stage) {
    this.orders.stage = stage;
    this.orders.search = '';
    this.tab = 'orders';
    history.replaceState(null, '', '#/admin/orders');
    this.drawFrame();
    this.loadOrders(false);
  },

  // ================================================================
  // Orders 탭
  // ================================================================
  loadOrders: async function (more) {
    var o = this.orders;
    var token = ++this.loadToken;
    o.loading = true;
    o.error = false;
    if (!more) { o.rows = []; o.hasMore = false; }
    if (!document.getElementById('admin-orders-list')) this.drawBody();
    this.drawOrdersList();
    try {
      var res = await cncAdminListOrders({ stage: o.stage, search: o.search, sort: o.sort, offset: more ? o.rows.length : 0 });
      if (token !== this.loadToken) return;
      o.rows = more ? o.rows.concat(res.rows) : res.rows;
      o.hasMore = res.hasMore;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      o.error = err;
    }
    o.loading = false;
    this.drawOrdersList();
  },

  ordersHtml: function () {
    var o = this.orders;
    var stageOptions = [{ v: 'active', k: 'admin_filter_active' }, { v: 'all', k: 'admin_filter_all' }]
      .concat(ADMIN_ALL_STAGES.map(function (s) { return { v: s, k: 'stage_' + s }; }));
    return '<div class="orders-tools admin-tools">' +
        '<div class="field">' +
          '<label class="field-label" for="admin-stage">' + escHtml(t('admin_filter_stage')) + '</label>' +
          '<select class="input" id="admin-stage" onchange="PageAdmin.setFilter(\'stage\', this.value)">' + stageOptions.map(function (x) {
            return '<option value="' + x.v + '"' + (x.v === o.stage ? ' selected' : '') + '>' + escHtml(t(x.k)) + '</option>';
          }).join('') + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="admin-sort">' + escHtml(t('admin_sort')) + '</label>' +
          '<select class="input" id="admin-sort" onchange="PageAdmin.setFilter(\'sort\', this.value)">' +
            '<option value="newest"' + (o.sort === 'newest' ? ' selected' : '') + '>' + escHtml(t('admin_sort_newest')) + '</option>' +
            '<option value="deadline"' + (o.sort === 'deadline' ? ' selected' : '') + '>' + escHtml(t('admin_sort_deadline')) + '</option>' +
          '</select>' +
        '</div>' +
        '<div class="field admin-search">' +
          '<label class="field-label" for="admin-search">' + escHtml(t('admin_search_orders')) + '</label>' +
          '<div class="search-box"><span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input class="input" id="admin-search" type="search" maxlength="40" value="' + escHtml(o.search) + '" ' +
            'placeholder="' + escHtml(t('admin_search_orders_ph')) + '" oninput="PageAdmin.onOrderSearch(this.value)"></div>' +
        '</div>' +
      '</div>' +
      '<div id="admin-orders-list"></div>';
  },

  setFilter: function (field, value) {
    this.orders[field] = value;
    this.loadOrders(false);
  },

  onOrderSearch: function (value) {
    var self = this;
    this.orders.search = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(function () { self.loadOrders(false); }, 350);
  },

  drawOrdersList: function () {
    var box = document.getElementById('admin-orders-list');
    if (!box) return;
    var o = this.orders;
    var self = this;
    if (o.error) { box.innerHTML = this.errorBox('PageAdmin.loadOrders(false)', o.error); return; }
    if (!o.rows.length && o.loading) { box.innerHTML = '<div class="card">' + uiLoading() + '</div>'; return; }
    if (!o.rows.length) { box.innerHTML = '<div class="card"><p class="empty-text">' + escHtml(t('admin_no_orders')) + '</p></div>'; return; }

    // PC: 표
    var table = '<div class="table-wrap admin-table-wrap"><table class="table admin-table"><thead><tr>' +
      '<th>' + escHtml(t('order_number')) + '</th><th>' + escHtml(t('admin_received')) + '</th><th>' + escHtml(t('clinic_name')) + '</th>' +
      '<th>' + escHtml(t('patient_label')) + '</th><th>' + escHtml(t('teeth_label')) + '</th><th>' + escHtml(t('case_deadline_label')) + '</th>' +
      '<th>' + escHtml(t('admin_stage')) + '</th></tr></thead><tbody>' +
      o.rows.map(function (r) {
        return '<tr class="clickable" tabindex="0" onclick="PageAdmin.openOrder(\'' + escHtml(r.id) + '\')" onkeydown="if(event.key===\'Enter\')PageAdmin.openOrder(\'' + escHtml(r.id) + '\')">' +
          '<td class="mono nowrap"><b>' + escHtml(r.id) + '</b></td>' +
          '<td class="nowrap">' + escHtml(formatDate(r.created_at)) + '</td>' +
          '<td>' + escHtml(r.clinic) + '</td>' +
          '<td>' + escHtml(r.patient || t('anonymous')) + '</td>' +
          '<td class="mono">' + formatNumber(r.teeth_count) + '</td>' +
          '<td class="nowrap">' + self.dueHtml(r) + '</td>' +
          '<td>' + uiStageBadge(r.stage) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // 모바일: 카드
    var cards = '<ul class="admin-order-cards">' + o.rows.map(function (r) {
      return '<li><button type="button" class="card admin-order-card" onclick="PageAdmin.openOrder(\'' + escHtml(r.id) + '\')">' +
        '<span class="order-top"><span class="order-id mono">' + escHtml(r.id) + '</span>' + uiStageBadge(r.stage) + '</span>' +
        '<span class="admin-card-clinic">' + escHtml(r.clinic) + '</span>' +
        '<span class="order-meta">' +
          '<span><span class="muted">' + escHtml(t('patient_label')) + '</span> ' + escHtml(r.patient || t('anonymous')) + '</span>' +
          '<span><span class="muted">' + escHtml(t('teeth_label')) + '</span> <span class="mono">' + formatNumber(r.teeth_count) + '</span></span>' +
          '<span><span class="muted">' + escHtml(t('case_deadline_label')) + '</span> ' + self.dueHtml(r) + '</span>' +
          '<span><span class="muted">' + escHtml(t('admin_received')) + '</span> ' + escHtml(formatDate(r.created_at)) + '</span>' +
        '</span></button></li>';
    }).join('') + '</ul>';

    box.innerHTML = table + cards +
      (o.hasMore ? '<div class="load-more"><button type="button" class="btn btn-outline btn-lg" onclick="PageAdmin.loadOrders(true)"' + (o.loading ? ' disabled' : '') + '>' +
        escHtml(o.loading ? t('loading') : t('load_more')) + '</button></div>' : '');
  },

  // ================================================================
  // 주문 상세 (모달)
  // ================================================================
  openOrder: function (id) {
    if (this.detail && this.detail.modal) this.detail.modal.close();
    var self = this;
    var state = { id: id, order: null, profile: null, busy: false, progress: null, error: null, modal: null };
    this.detail = state;
    state.modal = uiModal({
      title: t('admin_order_detail') + ' · ' + id,
      body: uiLoading(),
      wide: true,
      onClose: function () { if (self.detail === state) self.detail = null; }
    });
    this.loadDetail();
  },

  loadDetail: async function () {
    var st = this.detail;
    if (!st) return;
    try {
      var res = await cncAdminGetOrder(st.id);
      if (this.detail !== st) return;
      st.order = res.order;
      st.profile = res.profile;
      st.error = null;
    } catch (err) {
      console.error(err);
      if (this.detail !== st) return;
      st.error = err;
    }
    this.drawDetail();
  },

  drawDetail: function () {
    var st = this.detail;
    if (!st || !st.modal) return;
    var body = st.modal.el.querySelector('.modal-body');
    if (!body) return;
    if (st.error) {
      body.innerHTML = '<p class="error-text"><span aria-hidden="true">⚠</span> ' + escHtml(uiErrorMessage(st.error)) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadDetail()">' + escHtml(t('btn_retry')) + '</button>';
      return;
    }
    if (!st.order) { body.innerHTML = uiLoading(); return; }

    var o = st.order;
    var p = st.profile || {};
    var self = this;
    function row(labelKey, value, mono) {
      return '<div class="review-row"><span class="review-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="review-value' + (mono ? ' mono' : '') + '">' + value + '</span></div>';
    }

    var html = '<div class="admin-detail">';

    // 진행 상황
    html += '<div class="admin-detail-status">' + uiStageBadge(o.stage) + (o.stage === 'cancelled' ? '' : uiStageBar(o.stage)) + '</div>';

    // 처리 버튼
    html += this.actionsHtml(o);

    // 고객 · 주문 정보
    html += '<div class="admin-detail-grid">' +
      '<section><h3 class="detail-title">' + escHtml(t('admin_customer_info')) + '</h3>' +
        row('clinic_name', escHtml(o.clinic)) +
        row('address_label', escHtml(o.addr)) +
        row('phone_label', escHtml(o.phone), true) +
        row('line_id_label', escHtml(o.line_id || '—')) +
        row('nickname_label', escHtml(p.nickname || '—')) +
      '</section>' +
      '<section><h3 class="detail-title">' + escHtml(t('admin_order_info')) + '</h3>' +
        row('order_number', escHtml(o.id), true) +
        row('admin_received', escHtml(formatDateTime(o.created_at))) +
        row('patient_label', escHtml(o.patient || t('anonymous'))) +
        row('case_deadline_label', this.dueHtml(o)) +
        row('credits_use', formatNumber(o.credits_used), true) +
        (o.carrier ? row('carrier_label', escHtml(o.carrier)) : '') +
        (o.tracking_number ? row('tracking_label', escHtml(o.tracking_number), true) : '') +
      '</section></div>';

    var memo = cncOrderMemo(o);
    html += '<h3 class="detail-title">' + escHtml(t('memo_label')) + '</h3>' +
      (memo ? '<p class="pre memo-box">' + escHtml(memo) + '</p>' : '<p class="muted">—</p>');

    // 치아 표
    var teeth = cncOrderTeeth(o);
    html += '<h3 class="detail-title">' + escHtml(t('tooth_details')) + ' (' + teeth.length + ')</h3>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>' + escHtml(t('admin_tooth_name')) + '</th><th>' + escHtml(t('brand_label')) + '</th><th>' +
      escHtml(t('size_label')) + '</th><th>' + escHtml(t('wiz_shade_label')) + '</th></tr></thead><tbody>' +
      teeth.map(function (tt) {
        return '<tr><td class="mono"><b>#' + escHtml(tt.tooth) + '</b></td>' +
          '<td>' + escHtml(isValidTooth(tt.tooth) ? t(toothTypeKey(tt.tooth)) : (tt.toothName || '')) + '</td>' +
          '<td>' + escHtml(tt.brand === 'Other' ? t('brand_other') : (tt.brand || '—')) + '</td>' +
          '<td class="mono">' + escHtml(tt.size || '—') + '</td>' +
          '<td>' + uiShadeChip(tt.color) + ' <span class="mono">' + escHtml(tt.color || '—') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    // 고객 파일
    var files = cncOrderFiles(o);
    html += '<h3 class="detail-title">' + escHtml(t('admin_customer_files')) + ' (' + files.length + ')</h3>' +
      (files.length
        ? '<ul class="file-list">' + files.map(function (f, i) {
            return '<li class="file-row"><span class="file-icon" aria-hidden="true">' + uiFileIcon(f.name) + '</span>' +
              '<span class="file-info"><span class="file-name">' + escHtml(f.name) + '</span></span>' +
              '<span class="file-actions">' + (f.path
                ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.viewFile(' + i + ')"><span aria-hidden="true">👁</span> ' + escHtml(t('btn_preview')) + '</button>' +
                  '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.downloadFile(' + i + ')"><span aria-hidden="true">⬇</span> ' + escHtml(t('btn_download')) + '</button>'
                : '<span class="muted">' + escHtml(t('admin_no_path')) + '</span>') +
              '</span></li>';
          }).join('') + '</ul>'
        : '<p class="muted">' + escHtml(t('no_files_yet')) + '</p>');

    // 디자인 버전
    html += '<h3 class="detail-title">' + escHtml(t('admin_design_versions')) + '</h3>' +
      uiDesignVersions(cncOrderDesigns(o), function (vi, fi) { return 'PageAdmin.viewDesign(' + vi + ', ' + fi + ')'; });

    // 이력
    html += '<h3 class="detail-title">' + escHtml(t('admin_history')) + '</h3>' + uiHistoryList(o.review_history);

    html += '</div>';
    body.innerHTML = html;
  },

  // 현재 단계에 맞는 처리 버튼
  actionsHtml: function (o) {
    var st = this.detail;
    var dis = st.busy ? ' disabled' : '';
    var main = '';

    if (st.busy) {
      var prog = st.progress;
      main = '<div class="progress-box" role="status"><p><span class="spinner" aria-hidden="true"></span> ' +
        escHtml(prog ? tf('admin_uploading', { done: prog.done, total: prog.total }) : t('admin_processing')) +
        (prog && prog.name ? ' <span class="mono muted">' + escHtml(prog.name) + '</span>' : '') + '</p>' +
        (prog ? '<div class="progress"><div class="progress-fill" style="width:' + Math.round(prog.done / Math.max(prog.total, 1) * 100) + '%"></div></div>' : '') +
        '</div>';
    } else if (o.stage === 'submitted') {
      main = '<p>' + escHtml(t('admin_help_submitted')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.doConfirm()">' + escHtml(t('admin_confirm_order')) + '</button>';
    } else if (o.stage === 'confirmed' || o.stage === 'design_revision') {
      if (o.stage === 'design_revision') {
        var reason = this.lastRevisionNote(o);
        main += '<div class="revision-box"><p class="revision-title"><span aria-hidden="true">✎</span> ' + escHtml(t('admin_revision_request')) + '</p>' +
          '<p class="pre revision-text">' + escHtml(reason || '—') + '</p></div>';
      } else {
        main += '<p>' + escHtml(t('admin_help_confirmed')) + '</p>';
      }
      main += '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.openUploadDesign()"><span aria-hidden="true">⬆</span> ' + escHtml(t('admin_upload_design')) + '</button>';
    } else if (o.stage === 'design_ready') {
      main = '<p class="admin-waiting"><span aria-hidden="true">⏳</span> ' + escHtml(t('admin_wait_approval')) + '</p>';
    } else if (o.stage === 'approved') {
      main = '<p>' + escHtml(t('admin_help_approved')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.doStartMilling()">' + escHtml(t('admin_start_milling')) + '</button>';
    } else if (o.stage === 'milling') {
      main = '<p>' + escHtml(t('admin_help_milling')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.openShip()"><span aria-hidden="true">🚚</span> ' + escHtml(t('admin_ship')) + '</button>';
    } else if (o.stage === 'shipped') {
      main = '<p class="admin-waiting"><span aria-hidden="true">⏳</span> ' + escHtml(t('admin_wait_receive')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.doMarkDone()">' + escHtml(t('admin_mark_done')) + '</button>';
    } else if (o.stage === 'done') {
      main = '<p class="admin-waiting"><span aria-hidden="true">✓</span> ' + escHtml(t('admin_done_info')) + '</p>';
    } else if (o.stage === 'cancelled') {
      main = '<p class="admin-waiting">' + escHtml(tf('cancelled_help', { n: o.credits_used })) + '</p>';
    }

    // 공통 (작게): 단계 직접 변경, 취소·환불
    var canCancel = ADMIN_CANCELLABLE_STAGES.indexOf(o.stage) !== -1;
    var extra = '<details class="admin-extra"><summary>' + escHtml(t('admin_more_actions')) + '</summary>' +
      '<div class="admin-extra-body">' +
        '<div class="field">' +
          '<label class="field-label" for="admin-set-stage">' + escHtml(t('admin_change_stage')) + '</label>' +
          '<div class="bulk-row">' +
            '<select class="input" id="admin-set-stage"' + dis + '>' + ADMIN_ALL_STAGES.filter(function (s) { return s !== 'cancelled' && s !== o.stage; }).map(function (s) {
              return '<option value="' + s + '">' + escHtml(t('stage_' + s)) + '</option>';
            }).join('') + '</select>' +
            '<button type="button" class="btn btn-outline" onclick="PageAdmin.doSetStage()"' + dis + '>' + escHtml(t('admin_change_stage_btn')) + '</button>' +
          '</div>' +
        '</div>' +
        (canCancel
          ? '<button type="button" class="btn btn-outline btn-danger-text" onclick="PageAdmin.openCancel()"' + dis + '>' + escHtml(t('admin_cancel_refund')) + '</button>'
          : '<p class="muted">' + escHtml(t('admin_cancel_not_allowed')) + '</p>') +
      '</div></details>';

    return '<div class="action-box admin-actions highlight">' + main + '</div>' + extra;
  },

  // 가장 최근 수정 요청 사유
  lastRevisionNote: function (o) {
    var h = (o.review_history || []).slice().reverse();
    for (var i = 0; i < h.length; i++) {
      if (h[i] && h[i].action === 'rejected') return h[i].note;
    }
    return '';
  },

  // ----- 처리 공통: 처리 중 표시 → 실행 → 토스트 → 상세·목록 새로고침 -----
  runAction: async function (fn, successKey) {
    var st = this.detail;
    if (!st || st.busy) return;
    st.busy = true;
    st.progress = null;
    this.drawDetail();
    try {
      await fn(st);
      uiToast(t(successKey), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    st.busy = false;
    st.progress = null;
    if (this.detail === st) await this.loadDetail();
    this.loadTab();   // 목록·대시보드도 새로
  },

  doConfirm: async function () {
    var o = this.detail.order;
    if (!(await uiConfirm({ title: t('admin_confirm_order'), message: tf('admin_confirm_order_msg', { id: o.id }), okLabel: t('admin_confirm_order') }))) return;
    this.runAction(function (st) { return cncAdminConfirm(st.order); }, 'admin_done_confirmed');
  },

  doStartMilling: async function () {
    var o = this.detail.order;
    if (!(await uiConfirm({ title: t('admin_start_milling'), message: tf('admin_start_milling_msg', { id: o.id }), okLabel: t('admin_start_milling') }))) return;
    this.runAction(function (st) { return cncAdminStartMilling(st.order); }, 'admin_done_milling');
  },

  doMarkDone: async function () {
    var o = this.detail.order;
    if (!(await uiConfirm({ title: t('admin_mark_done'), message: tf('admin_mark_done_msg', { id: o.id }), okLabel: t('admin_mark_done') }))) return;
    this.runAction(function (st) { return cncAdminMarkDone(st.order); }, 'admin_done_marked');
  },

  doSetStage: async function () {
    var st = this.detail;
    var sel = st.modal.el.querySelector('#admin-set-stage');
    if (!sel) return;
    var to = sel.value;
    var ok = await uiConfirm({
      title: t('admin_change_stage'),
      message: tf('admin_change_stage_msg', { id: st.order.id, from: t('stage_' + st.order.stage), to: t('stage_' + to) }),
      okLabel: t('admin_change_stage_btn'),
      danger: true
    });
    if (!ok) return;
    this.runAction(function (s) { return cncAdminSetStage(s.order, to); }, 'admin_done_stage');
  },

  // ----- 디자인 업로드 (파일 여러 개) -----
  openUploadDesign: function () {
    var self = this;
    var st = this.detail;
    var version = cncNextDesignVersion(st.order);
    var chosen = [];
    var modal = uiModal({
      title: tf('admin_upload_design_title', { v: version }),
      body: '<p class="modal-text">' + escHtml(tf('admin_upload_design_help', { id: st.order.id })) + '</p>' +
        '<div class="drop-zone"><span class="drop-icon" aria-hidden="true">⬆</span>' +
          '<button type="button" class="btn btn-primary" id="design-choose">' + escHtml(t('choose_files')) + '</button>' +
          '<input type="file" id="design-input" multiple hidden>' +
          '<p class="drop-hint">' + escHtml(tf('file_limits_hint', { size: 50, count: FILE_MAX_COUNT })) + '</p></div>' +
        '<ul class="file-list design-chosen"></ul><div class="err-slot"></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('admin_upload_btn'), kind: 'primary', onClick: async function (close) {
          if (!chosen.length) {
            modal.el.querySelector('.err-slot').innerHTML = uiFieldError('admin_err_no_files');
            return;
          }
          var files = chosen.slice();
          close();
          self.runAction(function (s) {
            return cncAdminUploadDesign(s.order, files, function (p) {
              s.progress = p;
              self.drawDetail();
            });
          }, 'admin_done_design');
        } }
      ]
    });
    var input = modal.el.querySelector('#design-input');
    modal.el.querySelector('#design-choose').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var errs = [];
      Array.prototype.forEach.call(input.files, function (f) {
        if (f.size > FILE_MAX_BYTES) errs.push(tf('file_reject_size', { name: f.name, size: 50 }));
        else if (chosen.length >= FILE_MAX_COUNT) errs.push(tf('file_reject_count', { name: f.name, count: FILE_MAX_COUNT }));
        else if (!chosen.some(function (c) { return c.name === f.name && c.size === f.size; })) chosen.push(f);
      });
      input.value = '';
      draw();
      modal.el.querySelector('.err-slot').innerHTML = errs.map(function (e) {
        return '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(e) + '</p>';
      }).join('');
    });
    function draw() {
      var ul = modal.el.querySelector('.design-chosen');
      ul.innerHTML = chosen.map(function (f, i) {
        return '<li class="file-row"><span class="file-icon" aria-hidden="true">' + uiFileIcon(f.name) + '</span>' +
          '<span class="file-info"><span class="file-name">' + escHtml(f.name) + '</span><span class="file-size mono">' + formatBytes(f.size) + '</span></span>' +
          '<span class="file-actions"><button type="button" class="btn btn-outline btn-sm btn-danger-text" data-remove="' + i + '"><span aria-hidden="true">✕</span> ' + escHtml(t('btn_remove')) + '</button></span></li>';
      }).join('');
    }
    modal.el.querySelector('.design-chosen').addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]');
      if (!b) return;
      chosen.splice(+b.getAttribute('data-remove'), 1);
      draw();
    });
  },

  // ----- 배송 (택배사 + 송장번호) -----
  openShip: function () {
    var self = this;
    var modal = uiModal({
      title: t('admin_ship'),
      body: '<div class="field"><label class="field-label" for="ship-carrier">' + escHtml(t('carrier_label')) + ' <span class="required">*</span></label>' +
          '<input class="input" id="ship-carrier" type="text" maxlength="80" list="carrier-list" autocomplete="off">' +
          '<datalist id="carrier-list">' + ADMIN_CARRIERS.map(function (c) { return '<option value="' + escHtml(c) + '">'; }).join('') + '</datalist>' +
          '<div class="chip-row">' + ADMIN_CARRIERS.map(function (c) {
            return '<button type="button" class="chip" data-carrier="' + escHtml(c) + '">' + escHtml(c === 'Hand delivery' ? t('admin_hand_delivery') : c) + '</button>';
          }).join('') + '</div>' +
          '<div class="err-slot" data-err="carrier"></div></div>' +
        '<div class="field"><label class="field-label" for="ship-tracking">' + escHtml(t('tracking_label')) + ' <span class="required">*</span></label>' +
          '<input class="input mono" id="ship-tracking" type="text" maxlength="80" autocomplete="off">' +
          '<p class="field-help">' + escHtml(t('admin_tracking_help')) + '</p>' +
          '<div class="err-slot" data-err="tracking"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('admin_ship_btn'), kind: 'primary', onClick: function (close) {
          var carrier = modal.el.querySelector('#ship-carrier').value.trim();
          var tracking = modal.el.querySelector('#ship-tracking').value.trim();
          var hand = /^hand delivery$/i.test(carrier);
          var errs = { carrier: carrier ? '' : 'err_required', tracking: (tracking || hand) ? '' : 'err_required' };
          ['carrier', 'tracking'].forEach(function (k) {
            modal.el.querySelector('[data-err="' + k + '"]').innerHTML = uiFieldError(errs[k]);
            modal.el.querySelector('#ship-' + k).classList.toggle('invalid', !!errs[k]);
          });
          if (errs.carrier || errs.tracking) return;
          close();
          self.runAction(function (s) { return cncAdminShip(s.order, carrier, tracking); }, 'admin_done_shipped');
        } }
      ]
    });
    modal.el.querySelector('.chip-row').addEventListener('click', function (e) {
      var b = e.target.closest('[data-carrier]');
      if (!b) return;
      var input = modal.el.querySelector('#ship-carrier');
      input.value = b.getAttribute('data-carrier');
      input.classList.remove('invalid');
      modal.el.querySelector('#ship-tracking').focus();
    });
  },

  // ----- 취소 + 환불 (사유 필수) -----
  openCancel: function () {
    var self = this;
    var o = this.detail.order;
    var modal = uiModal({
      title: t('admin_cancel_refund'),
      body: '<p class="modal-text">' + escHtml(tf('admin_cancel_msg', { id: o.id, n: o.credits_used })) + '</p>' +
        '<div class="field"><label class="field-label" for="cancel-reason">' + escHtml(t('admin_cancel_reason')) + ' <span class="required">*</span></label>' +
        '<textarea class="input textarea" id="cancel-reason" rows="3" maxlength="500"></textarea><div class="err-slot"></div></div>',
      actions: [
        { label: t('keep_order'), kind: 'outline' },
        { label: t('admin_cancel_refund'), kind: 'danger', onClick: function (close) {
          var ta = modal.el.querySelector('#cancel-reason');
          var reason = ta.value.trim();
          if (!reason) {
            ta.classList.add('invalid');
            modal.el.querySelector('.err-slot').innerHTML = uiFieldError('admin_cancel_reason_required');
            ta.focus();
            return;
          }
          close();
          self.runAction(function (s) { return cncAdminCancel(s.order, reason); }, 'admin_done_cancelled');
        } }
      ]
    });
  },

  // ----- 파일 보기 · 다운로드 -----
  viewFile: function (i) {
    var f = cncOrderFiles(this.detail.order)[i];
    if (f) cncOpenViewer({ name: f.name, getUrl: function () { return cncOrderFileUrl(f); } });
  },

  downloadFile: async function (i) {
    var f = cncOrderFiles(this.detail.order)[i];
    if (!f) return;
    try {
      var url = await cncAdminDownloadUrl(CNC_FILES_BUCKET, f.path, f.name);
      var a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      uiToast(t('stl_load_error'), 'error');
    }
  },

  viewDesign: function (vi, fi) {
    var v = cncOrderDesigns(this.detail.order)[vi];
    var f = v && v.files[fi];
    if (!f) return;
    var name = f.name;
    if (!fileExt(name)) name += '.' + (fileExt(f.path || f.url || '') || 'png');
    cncOpenViewer({ name: name, getUrl: function () { return cncDesignUrl(f); } });
  },

  // ================================================================
  // Customers 탭
  // ================================================================
  loadUsers: async function () {
    var token = ++this.loadToken;
    this.users.error = false;
    if (!document.getElementById('admin-users-list')) this.drawBody();
    this.drawUsersList();
    try {
      var rows = await cncAdminListUsers();
      if (token !== this.loadToken) return;
      this.users.rows = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.users.error = err;
    }
    this.drawUsersList();
  },

  usersHtml: function () {
    return '<div class="orders-tools">' +
        '<div class="search-box">' +
          '<label class="sr-only" for="admin-user-search">' + escHtml(t('admin_search_users')) + '</label>' +
          '<span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input class="input" id="admin-user-search" type="search" maxlength="60" value="' + escHtml(this.users.search) + '" ' +
            'placeholder="' + escHtml(t('admin_search_users')) + '" oninput="PageAdmin.onUserSearch(this.value)">' +
        '</div>' +
      '</div>' +
      '<div id="admin-users-list"></div>';
  },

  onUserSearch: function (value) {
    this.users.search = value;
    this.drawUsersList();
  },

  filteredUsers: function () {
    var q = this.users.search.trim().toLowerCase();
    var rows = this.users.rows || [];
    if (!q) return rows;
    return rows.filter(function (u) {
      return [u.email, u.nickname, u.clinic_name, u.phone].some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
    });
  },

  drawUsersList: function () {
    var box = document.getElementById('admin-users-list');
    if (!box) return;
    if (this.users.error) { box.innerHTML = this.errorBox('PageAdmin.loadUsers()', this.users.error); return; }
    if (!this.users.rows) { box.innerHTML = '<div class="card">' + uiLoading() + '</div>'; return; }
    var rows = this.filteredUsers();
    if (!rows.length) { box.innerHTML = '<div class="card"><p class="empty-text">' + escHtml(t('admin_no_users')) + '</p></div>'; return; }

    var table = '<div class="table-wrap admin-table-wrap"><table class="table admin-table"><thead><tr>' +
      '<th>' + escHtml(t('email_label')) + '</th><th>' + escHtml(t('nickname_label')) + '</th><th>' + escHtml(t('clinic_name')) + '</th>' +
      '<th>' + escHtml(t('phone_label')) + '</th><th>' + escHtml(t('credit_balance')) + '</th><th>' + escHtml(t('admin_joined')) + '</th></tr></thead><tbody>' +
      rows.map(function (u) {
        return '<tr class="clickable" tabindex="0" onclick="PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')" onkeydown="if(event.key===\'Enter\')PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')">' +
          '<td>' + escHtml(u.email) + '</td><td>' + escHtml(u.nickname) + '</td><td>' + escHtml(u.clinic_name) + '</td>' +
          '<td class="mono nowrap">' + escHtml(u.phone) + '</td><td class="mono"><b>' + formatNumber(u.balance) + '</b></td>' +
          '<td class="nowrap">' + escHtml(formatDate(u.created_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var cards = '<ul class="admin-order-cards">' + rows.map(function (u) {
      return '<li><button type="button" class="card admin-order-card" onclick="PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')">' +
        '<span class="order-top"><span class="admin-card-clinic">' + escHtml(u.clinic_name || u.nickname || u.email) + '</span>' +
        '<span class="credit-badge-sm mono">💳 ' + formatNumber(u.balance) + '</span></span>' +
        '<span class="order-meta"><span>' + escHtml(u.email) + '</span><span>' + escHtml(u.nickname) + '</span>' +
        '<span class="mono">' + escHtml(u.phone) + '</span></span></button></li>';
    }).join('') + '</ul>';

    box.innerHTML = '<p class="muted admin-count">' + escHtml(tf('admin_users_count', { n: rows.length })) + '</p>' + table + cards;
  },

  // ================================================================
  // 고객 상세 (모달)
  // ================================================================
  openCustomer: function (userId) {
    var user = (this.users.rows || []).filter(function (u) { return u.id === userId; })[0];
    if (!user) return;
    if (this.customer && this.customer.modal) this.customer.modal.close();
    var self = this;
    var state = { user: Object.assign({}, user), history: null, orders: null, busy: false, error: null, modal: null };
    this.customer = state;
    state.modal = uiModal({
      title: t('admin_customer_detail') + ' · ' + (user.clinic_name || user.nickname || user.email),
      body: uiLoading(),
      wide: true,
      onClose: function () { if (self.customer === state) self.customer = null; }
    });
    this.drawCustomer();
    this.loadCustomer();
  },

  loadCustomer: async function () {
    var st = this.customer;
    if (!st) return;
    try {
      var res = await Promise.all([
        cncAdminCreditHistory(st.user.id, 100),
        cncAdminListOrders({ userId: st.user.id, stage: 'all', limit: 50 }),
        cncAdminGetBalance(st.user.id)
      ]);
      if (this.customer !== st) return;
      st.history = res[0];
      st.orders = res[1].rows;
      st.user.balance = res[2];
      st.error = null;
      this.syncUserBalance(st.user.id, res[2]);
    } catch (err) {
      console.error(err);
      if (this.customer !== st) return;
      st.error = err;
    }
    this.drawCustomer();
  },

  // 목록의 잔액도 같이 고치기
  syncUserBalance: function (userId, balance) {
    (this.users.rows || []).forEach(function (u) { if (u.id === userId) u.balance = balance; });
    this.drawUsersList();
  },

  drawCustomer: function () {
    var st = this.customer;
    if (!st || !st.modal) return;
    var body = st.modal.el.querySelector('.modal-body');
    if (!body) return;
    var u = st.user;
    var dis = st.busy ? ' disabled' : '';

    function row(labelKey, value, mono) {
      return '<div class="review-row"><span class="review-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="review-value' + (mono ? ' mono' : '') + '">' + escHtml(value || '—') + '</span></div>';
    }

    var html = '<div class="admin-detail-grid">' +
      '<section>' +
        row('email_label', u.email) + row('nickname_label', u.nickname) + row('clinic_name', u.clinic_name) +
        row('phone_label', u.phone, true) + row('admin_joined', formatDate(u.created_at)) +
      '</section>' +
      '<section class="credit-box">' +
        '<h3 class="review-title">' + escHtml(t('credit_balance')) + '</h3>' +
        '<p class="big-number mono" id="cust-balance">' + formatNumber(u.balance) + ' <span class="big-number-unit">' + escHtml(t('credit_unit')) + '</span></p>' +
        '<div class="field"><label class="field-label" for="cust-amount">' + escHtml(t('admin_credit_amount')) + '</label>' +
          '<input class="input mono" id="cust-amount" type="number" step="1" inputmode="numeric" placeholder="' + escHtml(t('admin_credit_amount_ph')) + '"' + dis + '>' +
          '<div class="err-slot" data-err="amount"></div></div>' +
        '<div class="field"><label class="field-label" for="cust-desc">' + escHtml(t('col_description')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
          '<input class="input" id="cust-desc" type="text" maxlength="200" placeholder="' + escHtml(t('admin_credit_desc_ph')) + '"' + dis + '></div>' +
        '<div class="action-row">' +
          '<button type="button" class="btn btn-primary" onclick="PageAdmin.addCredits()"' + dis + '>' + escHtml(st.busy ? t('admin_processing') : t('admin_add_credits')) + '</button>' +
          [10, 50, 100].map(function (n) {
            return '<button type="button" class="btn btn-outline" onclick="PageAdmin.addCredits(' + n + ')"' + dis + '>+' + n + '</button>';
          }).join('') +
        '</div>' +
        '<p class="field-help">' + escHtml(t('admin_credit_help')) + '</p>' +
      '</section></div>';

    if (st.error) {
      html += '<p class="error-text"><span aria-hidden="true">⚠</span> ' + escHtml(uiErrorMessage(st.error)) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadCustomer()">' + escHtml(t('btn_retry')) + '</button>';
    }

    // 크레딧 이력
    html += '<h3 class="detail-title">' + escHtml(t('credit_history_title')) + '</h3>';
    if (st.history === null) html += uiLoading();
    else if (!st.history.length) html += '<p class="muted">' + escHtml(t('credit_no_history')) + '</p>';
    else html += '<div class="table-wrap"><table class="table credit-table"><thead><tr>' +
      '<th>' + escHtml(t('col_date')) + '</th><th>' + escHtml(t('col_type')) + '</th><th>' + escHtml(t('col_amount')) + '</th>' +
      '<th>' + escHtml(t('col_description')) + '</th><th>' + escHtml(t('order_number')) + '</th></tr></thead><tbody>' +
      st.history.map(function (h) {
        var amount = Number(h.amount || 0);
        return '<tr><td class="mono nowrap">' + escHtml(formatDateTime(h.created_at)) + '</td>' +
          '<td><span class="badge credit-' + escHtml(h.type) + '">' + escHtml(t('credit_type_' + h.type)) + '</span></td>' +
          '<td class="mono nowrap ' + (amount >= 0 ? 'plus' : 'minus') + '">' + (amount > 0 ? '+' : '') + formatNumber(amount) + '</td>' +
          '<td>' + escHtml(h.description || '') + '</td><td class="mono nowrap">' + escHtml(h.order_id || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // 이 고객의 주문
    html += '<h3 class="detail-title">' + escHtml(t('admin_customer_orders')) + '</h3>';
    if (st.orders === null) html += uiLoading();
    else if (!st.orders.length) html += '<p class="muted">' + escHtml(t('orders_empty')) + '</p>';
    else html += '<ul class="order-list">' + st.orders.map(function (o) {
      return '<li><button type="button" class="order-row" onclick="PageAdmin.openOrderFromCustomer(\'' + escHtml(o.id) + '\')">' +
        '<span class="order-row-id mono">' + escHtml(o.id) + '</span>' +
        '<span class="order-row-meta">' + escHtml(formatDate(o.created_at)) + ' · ' + escHtml(o.patient || t('anonymous')) + ' · ' + escHtml(tf('teeth_count_fmt', { n: o.teeth_count })) + '</span>' +
        uiStageBadge(o.stage) + '</button></li>';
    }).join('') + '</ul>';

    body.innerHTML = html;
  },

  openOrderFromCustomer: function (id) {
    if (this.customer && this.customer.modal) this.customer.modal.close();
    this.openOrder(id);
  },

  // 크레딧 충전/차감 (quick: +10/+50/+100 버튼)
  addCredits: async function (quick) {
    var st = this.customer;
    if (!st || st.busy) return;
    var el = st.modal.el;
    var amount = quick != null ? quick : parseInt(el.querySelector('#cust-amount').value, 10);
    var desc = el.querySelector('#cust-desc').value.trim();
    var slot = el.querySelector('[data-err="amount"]');
    if (!amount || isNaN(amount)) {
      slot.innerHTML = uiFieldError('admin_err_amount');
      el.querySelector('#cust-amount').classList.add('invalid');
      return;
    }
    var who = st.user.clinic_name || st.user.nickname || st.user.email;
    var ok = await uiConfirm({
      title: t('admin_add_credits'),
      message: amount > 0 ? tf('admin_add_credits_msg', { n: amount, name: who }) : tf('admin_deduct_credits_msg', { n: -amount, name: who }),
      okLabel: t('btn_ok'),
      danger: amount < 0
    });
    if (!ok) return;
    st.busy = true;
    this.drawCustomer();
    try {
      var balance = await cncAdminAddCredits(st.user.id, amount, desc || (amount > 0 ? 'Admin charge' : 'Admin adjustment'));
      st.busy = false;
      if (balance != null) { st.user.balance = balance; this.syncUserBalance(st.user.id, balance); }
      uiToast(tf('admin_credits_done', { balance: formatNumber(st.user.balance) }), 'success');
      // 관리자 본인 잔액이 바뀐 경우 헤더 배지도
      if (st.user.id === APP.user.id) refreshBalance();
    } catch (err) {
      console.error(err);
      st.busy = false;
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawCustomer();
    this.loadCustomer();
  }
};
