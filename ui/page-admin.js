// ===== 관리자 화면 #/admin =====
// 탭 7개: Orders(주문 처리) / Top-ups(충전 승인) / Customers(고객·크레딧) / Dashboard(현황) / Activity(작업 기록) / Team(팀) / Settings(가격·결제·LINE 그룹)
// 주소: #/admin/orders, #/admin/topups, #/admin/customers, #/admin/dashboard, #/admin/activity, #/admin/team, #/admin/settings
// 역할(sql/005_team.sql)에 따라 탭·버튼이 보여요: staff = Orders·Activity / manager = + Top-ups·Customers·Dashboard(주문 통계) / owner = 전부
// (권한 없는 탭 주소로 들어오면 Orders 로 — 실제 보호는 DB 규칙)
// Team·Activity·LINE 그룹 화면은 ui/page-admin-team.js 에 있어요.
// 데이터 처리는 cnc/cnc-admin.js 가 하고, 이 파일은 화면만 그려요.

var PageAdmin = {
  main: null,
  tab: 'orders',
  loadToken: 0,

  // Orders 탭 상태
  orders: { stage: 'active', search: '', sort: 'newest', rows: [], hasMore: false, loading: false, error: false },
  // Dashboard 탭 상태 (now: 지금 기준, month: 선택한 달, trend: 최근 12개월)
  dash: { year: null, month: null, now: null, monthData: null, trend: null, error: false },
  // Customers 탭 상태
  users: { rows: null, search: '', error: false, lineFilter: 'all' },   // lineFilter: 'all' | 'unlinked'

  // 열려 있는 주문 상세
  detail: null,     // { modal, id, order, profile, busy, progress, error }
  // 열려 있는 고객 상세
  customer: null,   // { modal, user, history, orders, busy }

  searchTimer: null,

  // min: 이 탭을 볼 수 있는 가장 낮은 역할
  TABS: [
    { id: 'orders', key: 'admin_tab_orders', min: 'staff' },
    { id: 'topups', key: 'admin_tab_topups', min: 'manager' },
    { id: 'customers', key: 'admin_tab_customers', min: 'manager' },
    { id: 'dashboard', key: 'admin_tab_dashboard', min: 'manager' },
    { id: 'activity', key: 'admin_tab_activity', min: 'staff' },
    { id: 'team', key: 'admin_tab_team', min: 'owner' },
    { id: 'settings', key: 'admin_tab_settings', min: 'owner' }
  ],

  // 지금 역할로 볼 수 있는 탭
  allowedTabs: function () {
    return this.TABS.filter(function (x) { return cncHasRole(x.min); });
  },

  canSeeTab: function (id) {
    return this.allowedTabs().some(function (x) { return x.id === id; });
  },

  // Top-ups 탭 상태
  topups: { status: 'pending', rows: [], hasMore: false, loading: false, error: false },
  topupDetail: null,     // { modal, row, busy, slipUrl, slipError }
  // Settings 탭 상태
  settingsTab: { packages: null, settings: null, company: null, versions: null, error: false, saving: false, savingCompany: false },
  // Customers 탭의 계정 삭제 요청
  deletions: { rows: null, status: 'pending', error: false },

  // ================================================================
  // 페이지 열기 / 다시 그리기 / 떠나기
  // ================================================================
  render: function (main) {
    this.main = main;
    var m = /^#\/admin\/([a-z]+)/.exec(location.hash || '');
    this.tab = (m && this.canSeeTab(m[1])) ? m[1] : 'orders';
    // 권한 없는 탭 주소로 들어왔으면 주소도 Orders 로
    if (m && m[1] !== this.tab) history.replaceState(null, '', '#/admin/orders');
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
          '<h1 class="page-title"><span class="admin-badge admin-badge-lg">' + escHtml(t('nav_admin')) + adminRoleTagHtml() + '</span> ' + escHtml(t('admin_title')) + '</h1>' +
          '<button type="button" class="btn btn-outline" onclick="PageAdmin.refresh()"><span aria-hidden="true">↻</span> ' + escHtml(t('admin_refresh')) + '</button>' +
        '</div>' +
        '<div class="seg admin-tabs" role="tablist">' + this.allowedTabs().map(function (x) {
          var on = self.tab === x.id;
          return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setTab(\'' + x.id + '\')">' + escHtml(t(x.key)) + '</button>';
        }).join('') + '</div>' +
        '<div id="admin-body"></div>' +
      '</div>';
  },

  setTab: function (id) {
    if (this.tab === id) return;
    if (!this.canSeeTab(id)) return;
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
    if (this.tab === 'topups') return this.loadTopups(false);
    if (this.tab === 'customers') return this.loadUsers();
    if (this.tab === 'settings') return this.loadSettings();
    if (this.tab === 'activity') return this.loadActivity();
    if (this.tab === 'team') return this.loadTeam();
    return this.loadDash();
  },

  drawBody: function () {
    var box = document.getElementById('admin-body');
    if (!box) return;
    if (this.tab === 'orders') box.innerHTML = this.ordersHtml();
    else if (this.tab === 'topups') box.innerHTML = this.topupsHtml();
    else if (this.tab === 'customers') box.innerHTML = this.usersHtml();
    else if (this.tab === 'settings') { box.innerHTML = this.settingsHtml(); this.drawLineGroups(); }
    else if (this.tab === 'activity') box.innerHTML = this.activityHtml();
    else if (this.tab === 'team') box.innerHTML = this.teamHtml();
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
  // 맨 위: ◀ 월 ▶ (주문·매출이 같이 사용), 구역 이동 버튼
  // Orders 구역: 지금 기준 단계별 카드·Due soon / 선택한 달 숫자 카드 5개·일별 막대·12개월 추이·완료 목록
  // Revenue 구역: ui/page-admin-finance.js 의 financeHtml()

  ensureMonth: function () {
    if (this.dash.year == null) {
      var now = new Date();
      this.dash.year = now.getFullYear();
      this.dash.month = now.getMonth();
    }
  },

  isCurrentMonth: function () {
    var now = new Date();
    return this.dash.year === now.getFullYear() && this.dash.month === now.getMonth();
  },

  loadDash: async function () {
    this.ensureMonth();
    var token = ++this.loadToken;
    var d = this.dash;
    d.error = false;
    d.now = null;
    d.monthData = null;
    d.trend = null;
    this.drawBody();
    try {
      var res = await Promise.all([
        cncAdminDashboardNow(),
        cncAdminPendingTopupCount().catch(function () { return null; }),
        cncAdminMonthStats(d.year, d.month),
        cncAdminTrend(d.year, d.month)
      ]);
      if (token !== this.loadToken) return;
      d.now = res[0];
      d.pendingTopups = res[1];
      d.monthData = res[2];
      d.trend = res[3];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      d.error = err;
    }
    this.drawBody();
    // 매출(Revenue) 구역 — 주문 통계와 따로 불러와요 (매출 쪽 오류가 주문 통계를 막지 않게)
    if (!cncHasRole('owner')) return;   // 매출은 owner 만
    await this.loadFinance(token);
    if (token === this.loadToken) this.drawBody();
  },

  // 달 바꾸기 (미래 달로는 못 가요)
  shiftMonth: function (n) {
    this.ensureMonth();
    var dt = new Date(this.dash.year, this.dash.month + n, 1);
    var now = new Date();
    if (dt > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    this.setMonth(dt.getFullYear(), dt.getMonth());
  },

  setMonth: async function (year, month) {
    var d = this.dash;
    d.year = year;
    d.month = month;
    var token = ++this.loadToken;
    d.monthData = null;
    d.trend = null;
    this.fin.month = null;
    this.drawBody();
    var fin = cncHasRole('owner') ? this.loadFinanceMonth(token) : Promise.resolve();
    try {
      var res = await Promise.all([cncAdminMonthStats(year, month), cncAdminTrend(year, month)]);
      if (token !== this.loadToken) return;
      d.monthData = res[0];
      d.trend = res[1];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      d.error = err;
    }
    this.drawBody();
    await fin;
    if (token === this.loadToken) this.drawBody();
  },

  monthLabel: function (year, month, short) {
    try {
      return new Intl.DateTimeFormat(localeTag(), short ? { month: 'short' } : { year: 'numeric', month: 'long' }).format(new Date(year, month, 1));
    } catch (e) {
      return year + '-' + String(month + 1).padStart(2, '0');
    }
  },

  // 대시보드 순서
  //   1) 지금 처리할 일: 대기 중 충전 요청 / 접수 대기 주문 / 기한 임박 — 누르면 그 탭·필터로
  //   2) 현재 현황: 단계별 주문 카드, 기한 임박 목록
  //   3) 구분선 + ◀ 월 ▶ + "월별 통계" — (owner) [주문 | 매출] 탭으로 전환
  dashHtml: function () {
    var d = this.dash;
    if (d.error) return this.errorBox('PageAdmin.loadDash()', d.error);
    var owner = cncHasRole('owner');
    var zone = owner && d.zone === 'revenue' ? 'revenue' : 'orders';
    var html = this.actionNowHtml() + this.currentStatusHtml();

    html += '<div class="dash-monthly">' +
      this.monthNavHtml() +
      '<h2 class="dash-section-title">' + escHtml(t('dash_monthly_title')) + '</h2>';
    if (owner) {
      html += '<div class="dash-tabs" role="tablist" aria-label="' + escHtml(t('dash_monthly_title')) + '">' +
        '<button type="button" role="tab" class="dash-tab' + (zone === 'orders' ? ' active' : '') + '" aria-selected="' + (zone === 'orders') + '" onclick="PageAdmin.setDashZone(\'orders\')">' +
          '<span aria-hidden="true">📦</span> ' + escHtml(t('fin_zone_orders')) + '</button>' +
        '<button type="button" role="tab" class="dash-tab' + (zone === 'revenue' ? ' active' : '') + '" aria-selected="' + (zone === 'revenue') + '" onclick="PageAdmin.setDashZone(\'revenue\')">' +
          '<span aria-hidden="true">💰</span> ' + escHtml(t('fin_zone_revenue')) + '</button>' +
        '</div>';
    }
    if (zone === 'orders') {
      html += '<section class="dash-zone" id="zone-orders" role="tabpanel">' + this.monthlyOrdersHtml() + '</section>';
    } else {
      html += '<section class="dash-zone" id="zone-revenue" role="tabpanel">' +
        '<p class="muted zone-note">' + escHtml(t('fin_zone_note')) + '</p>' + this.financeHtml() + '</section>';
    }
    html += '</div>';
    return html;
  },

  // 월별 통계 탭 바꾸기 (주문 / 매출)
  setDashZone: function (zone) {
    this.dash.zone = zone;
    this.drawBody();
  },

  // 1) 지금 처리할 일
  actionNowHtml: function () {
    var d = this.dash;
    if (!d.now) return '';
    function card(count, labelKey, onclick, cls) {
      return '<button type="button" class="dash-action' + (count ? ' has' : '') + ' ' + (cls || '') + '" onclick="' + onclick + '">' +
        '<span class="dash-action-count mono">' + formatNumber(count || 0) + '</span>' +
        '<span class="dash-action-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="arrow" aria-hidden="true">→</span></button>';
    }
    var items = '';
    if (cncHasRole('manager') && d.pendingTopups != null) items += card(d.pendingTopups, 'admin_pending_topups', "PageAdmin.setTab('topups')", 'dash-action-topups');
    items += card(d.now.counts.submitted, 'dash_waiting_orders', "PageAdmin.filterStage('submitted')", 'dash-action-submitted');
    items += card(d.now.due.length, 'dash_due_soon', 'PageAdmin.filterDue()', 'dash-action-due');
    return '<section class="dash-section">' +
      '<h2 class="dash-section-title">' + escHtml(t('dash_now_title')) + '</h2>' +
      '<div class="dash-actions">' + items + '</div></section>';
  },

  // 기한 임박 → Orders 탭 (진행 중 · 납기 빠른 순)
  filterDue: function () {
    this.orders.stage = 'active';
    this.orders.sort = 'deadline';
    this.orders.search = '';
    this.tab = 'orders';
    history.replaceState(null, '', '#/admin/orders');
    this.drawFrame();
    this.loadOrders(false);
  },

  // 2) 현재 현황 (단계별 카드 + 기한 임박 목록)
  currentStatusHtml: function () {
    var self = this;
    var d = this.dash;
    var html = '<section class="dash-section"><h2 class="dash-section-title">' + escHtml(t('dash_status_title')) + '</h2>';
    // ----- 지금 기준 -----
    if (!d.now) {
      html += '<div class="card">' + uiLoading() + '</div>';
    } else {
      html += '<h3 class="section-label">' + escHtml(t('admin_by_stage')) + '</h3>' +
        '<div class="admin-stage-cards">' + ADMIN_ACTIVE_STAGES.map(function (stage) {
          return '<button type="button" class="admin-stage-card stage-card-' + stage + '" style="' + uiStageStyle(stage) + '" onclick="PageAdmin.filterStage(\'' + stage + '\')">' +
            '<span class="admin-stage-count mono">' + formatNumber(d.now.counts[stage]) + '</span>' +
            '<span class="admin-stage-name">' + escHtml(t('stage_' + stage)) + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('admin_due_soon')) + '</h2>' +
          '<span class="muted">' + escHtml(tf('admin_due_soon_desc', { n: ADMIN_DUE_DAYS })) + '</span></div>' +
          (d.now.due.length
            ? '<ul class="order-list">' + d.now.due.map(function (o) {
                return '<li><button type="button" class="order-row admin-due-row ' + cncDueState(o) + '" onclick="PageAdmin.openOrder(\'' + escHtml(o.id) + '\')">' +
                  '<span class="order-row-id mono">' + escHtml(o.id) + '</span>' +
                  '<span class="order-row-meta">' + self.dueHtml(o) + ' · ' + escHtml(o.clinic || '') + ' · ' + escHtml(o.patient || '—') + ' · ' + escHtml(tf('teeth_count_fmt', { n: o.teeth_count })) + '</span>' +
                  uiStageBadge(o.stage) + '</button></li>';
              }).join('') + '</ul>'
            : '<p class="empty-text">' + escHtml(t('admin_no_due')) + '</p>') +
        '</section>';
    }

    return html + '</section>';
  },

  // 3) 선택한 달 주문 통계
  monthlyOrdersHtml: function () {
    var self = this;
    var d = this.dash;
    var html = '';

    var m = d.monthData;
    if (!m) return html + '<div class="card">' + uiLoading() + '</div>';

    function stat(key, value, cls) {
      return '<div class="card admin-stat ' + (cls || '') + '"><span class="admin-stat-label">' + escHtml(t(key)) + '</span>' +
        '<span class="admin-stat-num mono">' + formatNumber(value) + '</span></div>';
    }
    html += '<div class="admin-stats five">' +
      stat('admin_m_orders', m.orders) +
      stat('admin_m_teeth', m.teeth) +
      stat('admin_m_done', m.done, 'stat-done') +
      stat('admin_m_cancelled', m.cancelled, 'stat-cancelled') +
      stat('admin_m_progress', m.inProgress) +
      '</div>';

    // 일별 막대
    var maxDay = Math.max.apply(null, m.daily.concat([1]));
    html += '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('admin_daily_title')) + '</h2>' +
      '<span class="muted">' + escHtml(tf('admin_max_fmt', { n: maxDay })) + '</span></div>' +
      '<div class="bars daily" role="img" aria-label="' + escHtml(t('admin_daily_title')) + '">' + m.daily.map(function (n, i) {
        var label = (i + 1) + ': ' + n;
        return '<div class="bar-col" title="' + escHtml(label) + '">' +
          '<span class="bar-val mono">' + (n || '') + '</span>' +
          '<span class="bar" style="height:' + (n ? Math.max(4, Math.round(n / maxDay * 100)) : 0) + '%"></span>' +
          '<span class="bar-label mono">' + ((i + 1) % 5 === 0 || i === 0 ? i + 1 : '') + '</span>' +
          '</div>';
      }).join('') + '</div></section>';

    // 최근 12개월 추이 (막대를 누르면 그 달로)
    if (d.trend) {
      var maxT = Math.max.apply(null, d.trend.map(function (x) { return Math.max(x.orders, x.teeth); }).concat([1]));
      html += '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('admin_trend_title')) + '</h2>' +
        '<span class="legend"><span class="legend-dot orders"></span>' + escHtml(t('admin_m_orders')) +
        ' <span class="legend-dot teeth"></span>' + escHtml(t('admin_m_teeth')) + '</span></div>' +
        '<div class="bars trend">' + d.trend.map(function (x) {
          var sel = x.year === d.year && x.month === d.month;
          return '<button type="button" class="bar-group' + (sel ? ' selected' : '') + '" onclick="PageAdmin.setMonth(' + x.year + ', ' + x.month + ')" ' +
            'title="' + escHtml(self.monthLabel(x.year, x.month) + ' · ' + x.orders + ' / ' + x.teeth) + '">' +
            '<span class="bar-pair">' +
              '<span class="bar orders" style="height:' + (x.orders ? Math.max(4, Math.round(x.orders / maxT * 100)) : 0) + '%"></span>' +
              '<span class="bar teeth" style="height:' + (x.teeth ? Math.max(4, Math.round(x.teeth / maxT * 100)) : 0) + '%"></span>' +
            '</span>' +
            '<span class="bar-label">' + escHtml(self.monthLabel(x.year, x.month, true)) + '</span>' +
            '<span class="bar-val mono">' + x.orders + '/' + x.teeth + '</span>' +
            '</button>';
        }).join('') + '</div></section>';
    }

    // 그 달에 완료된 주문
    html += '<section class="card"><div class="card-head"><h2 class="card-title">' + escHtml(t('admin_completed_month')) + '</h2>' +
      '<span class="muted">' + escHtml(tf('admin_orders_count', { n: m.completed.length })) + '</span></div>' +
      (m.completed.length
        ? '<div class="table-wrap"><table class="table admin-table-plain"><thead><tr>' +
            '<th>' + escHtml(t('order_number')) + '</th><th>' + escHtml(t('clinic_name')) + '</th><th>' + escHtml(t('patient_label')) + '</th>' +
            '<th>' + escHtml(t('teeth_label')) + '</th><th>' + escHtml(t('admin_completed_date')) + '</th></tr></thead><tbody>' +
            m.completed.map(function (o) {
              return '<tr class="clickable" tabindex="0" onclick="PageAdmin.openOrder(\'' + escHtml(o.id) + '\')" onkeydown="if(event.key===\'Enter\')PageAdmin.openOrder(\'' + escHtml(o.id) + '\')">' +
                '<td class="mono nowrap"><b>' + escHtml(o.id) + '</b></td><td>' + escHtml(o.clinic) + '</td><td>' + escHtml(o.patient || '—') + '</td>' +
                '<td class="mono">' + formatNumber(o.teeth_count) + '</td><td class="nowrap">' + escHtml(formatDate(o.updated_at)) + '</td></tr>';
            }).join('') + '</tbody></table></div>'
        : '<p class="empty-text">' + escHtml(t('admin_no_completed')) + '</p>') +
      '</section>';

    return html;
  },

  // 월 선택 (◀ 2026년 11월 ▶)
  monthNavHtml: function () {
    var d = this.dash;
    return '<div class="month-nav">' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.shiftMonth(-1)" aria-label="' + escHtml(t('date_prev_month')) + '"><span class="arrow" aria-hidden="true">◀</span> ' + escHtml(t('admin_prev')) + '</button>' +
      '<h2 class="month-title">' + escHtml(this.monthLabel(d.year, d.month)) + '</h2>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.shiftMonth(1)"' + (this.isCurrentMonth() ? ' disabled' : '') + ' aria-label="' + escHtml(t('date_next_month')) + '">' + escHtml(t('admin_next')) + ' <span class="arrow" aria-hidden="true">▶</span></button>' +
      '</div>';
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
    // 순서: 진행 중 전체(기본) / 정말 전체 / 각 단계 / 완료 / 취소
    var stageOptions = [{ v: 'active', k: 'admin_filter_active' }, { v: 'all', k: 'admin_filter_all' }]
      .concat(ADMIN_ACTIVE_STAGES.map(function (s) { return { v: s, k: 'stage_' + s }; }))
      .concat([{ v: 'done', k: 'admin_filter_completed' }, { v: 'cancelled', k: 'admin_filter_cancelled' }]);
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
    html += '<h3 class="detail-title">' + escHtml(t('admin_history')) + '</h3>' + uiHistoryList(o.review_history, true);

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
        (prog && prog.name ? ' <span class="muted">' + escHtml(prog.name) + '</span>' : '') + '</p>' +
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
        (!cncHasRole('manager')
          ? '<p class="muted cancel-locked"><span aria-hidden="true">🔒</span> ' + escHtml(t('role_cancel_needs_manager')) + '</p>'
          : canCancel
          ? '<button type="button" class="btn btn-outline btn-danger-text" onclick="PageAdmin.openCancel()"' + dis + '>' + escHtml(t('admin_cancel_refund')) + '</button>'
          : '<p class="muted cancel-locked"><span aria-hidden="true">🔒</span> ' + escHtml(t('admin_cancel_not_allowed')) + '</p>') +
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
    this.loadDeletions();
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
    return '<section class="card admin-deletions" id="admin-deletions"></section>' +
      '<div class="orders-tools">' +
        '<div class="search-box">' +
          '<label class="sr-only" for="admin-user-search">' + escHtml(t('admin_search_users')) + '</label>' +
          '<span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input class="input" id="admin-user-search" type="search" maxlength="60" value="' + escHtml(this.users.search) + '" ' +
            'placeholder="' + escHtml(t('admin_search_users')) + '" oninput="PageAdmin.onUserSearch(this.value)">' +
        '</div>' +
        '<div class="field admin-line-filter"><label class="field-label" for="admin-line-filter">' + escHtml(t('admin_line_filter')) + '</label>' +
          '<select class="input" id="admin-line-filter" onchange="PageAdmin.setLineFilter(this.value)">' +
            '<option value="all"' + (this.users.lineFilter === 'all' ? ' selected' : '') + '>' + escHtml(t('admin_line_all')) + '</option>' +
            '<option value="unlinked"' + (this.users.lineFilter === 'unlinked' ? ' selected' : '') + '>' + escHtml(t('admin_line_unlinked_only')) + '</option>' +
          '</select></div>' +
      '</div>' +
      '<div id="admin-users-list"></div>';
  },

  onUserSearch: function (value) {
    this.users.search = value;
    this.drawUsersList();
  },

  setLineFilter: function (value) {
    this.users.lineFilter = value;
    this.drawUsersList();
  },

  // LINE 연결 표시 (✅ 연결됨 / ❌ 미연결 + 글자)
  lineStatusHtml: function (u) {
    return u.line_linked
      ? '<span class="line-status ok" title="' + escHtml(t('admin_line_linked')) + '"><span aria-hidden="true">✅</span> ' + escHtml(t('admin_line_linked')) + '</span>'
      : '<span class="line-status no" title="' + escHtml(t('admin_line_unlinked')) + '"><span aria-hidden="true">❌</span> ' + escHtml(t('admin_line_unlinked')) + '</span>';
  },

  filteredUsers: function () {
    var q = this.users.search.trim().toLowerCase();
    var rows = this.users.rows || [];
    if (this.users.lineFilter === 'unlinked') rows = rows.filter(function (u) { return !u.line_linked; });
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
    var self = this;
    var rows = this.filteredUsers();
    if (!rows.length) { box.innerHTML = '<div class="card"><p class="empty-text">' + escHtml(t('admin_no_users')) + '</p></div>'; return; }

    var table = '<div class="table-wrap admin-table-wrap"><table class="table admin-table"><thead><tr>' +
      '<th>' + escHtml(t('email_label')) + '</th><th>' + escHtml(t('nickname_label')) + '</th><th>' + escHtml(t('clinic_name')) + '</th>' +
      '<th>' + escHtml(t('phone_label')) + '</th><th>LINE</th><th>' + escHtml(t('credit_balance')) + '</th><th>' + escHtml(t('admin_joined')) + '</th></tr></thead><tbody>' +
      rows.map(function (u) {
        return '<tr class="clickable" tabindex="0" onclick="PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')" onkeydown="if(event.key===\'Enter\')PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')">' +
          '<td>' + escHtml(u.email) + '</td><td>' + escHtml(u.nickname) + '</td><td>' + escHtml(u.clinic_name) + '</td>' +
          '<td class="mono nowrap">' + escHtml(u.phone) + '</td><td class="nowrap">' + self.lineStatusHtml(u) + '</td><td class="mono"><b>' + formatNumber(u.balance) + '</b></td>' +
          '<td class="nowrap">' + escHtml(formatDate(u.created_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var cards = '<ul class="admin-order-cards">' + rows.map(function (u) {
      return '<li><button type="button" class="card admin-order-card" onclick="PageAdmin.openCustomer(\'' + escHtml(u.id) + '\')">' +
        '<span class="order-top"><span class="admin-card-clinic">' + escHtml(u.clinic_name || u.nickname || u.email) + '</span>' +
        '<span class="credit-badge-sm mono">💳 ' + formatNumber(u.balance) + '</span></span>' +
        '<span class="order-meta"><span>' + escHtml(u.email) + '</span><span>' + escHtml(u.nickname) + '</span>' +
        '<span class="mono">' + escHtml(u.phone) + '</span>' + self.lineStatusHtml(u) + '</span></button></li>';
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
        cncAdminGetBalance(st.user.id),
        cncAdminUserLots(st.user.id)
      ]);
      if (this.customer !== st) return;
      st.lots = res[3];
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
        '<p class="big-number" id="cust-balance"><span class="mono">' + formatNumber(u.balance) + '</span> <span class="big-number-unit">' + escHtml(t('credit_unit')) + '</span></p>' +
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

    // 크레딧 묶음 + 환불 계산기
    html += this.customerLotsHtml(st);

    // 크레딧 이력
    html += '<h3 class="detail-title">' + escHtml(t('credit_history_title')) + '</h3>';
    if (st.history === null) html += uiLoading();
    else if (!st.history.length) html += '<p class="muted">' + escHtml(t('credit_no_history')) + '</p>';
    else html += '<div class="table-wrap"><table class="table credit-table"><thead><tr>' +
      '<th>' + escHtml(t('col_date')) + '</th><th>' + escHtml(t('col_type')) + '</th><th>' + escHtml(t('col_amount')) + '</th>' +
      '<th>' + escHtml(t('col_description')) + '</th><th>' + escHtml(t('order_number')) + '</th></tr></thead><tbody>' +
      st.history.map(function (h) {
        var amount = Number(h.amount || 0);
        return '<tr><td class="nowrap">' + escHtml(formatDateTime(h.created_at)) + '</td>' +
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
,

  // ================================================================
  // Top-ups 탭 (입금 슬립 확인 → 승인 / 거절)
  // ================================================================
  TOPUP_STATUSES: ['pending', 'approved', 'rejected', 'cancelled', 'all'],

  loadTopups: async function (more) {
    var tp = this.topups;
    var token = ++this.loadToken;
    tp.loading = true;
    tp.error = false;
    if (!more) { tp.rows = []; tp.hasMore = false; }
    if (!document.getElementById('admin-topups-list')) this.drawBody();
    this.drawTopupsList();
    try {
      var res = await cncAdminListTopups({ status: tp.status, offset: more ? tp.rows.length : 0 });
      if (token !== this.loadToken) return;
      tp.rows = more ? tp.rows.concat(res.rows) : res.rows;
      tp.hasMore = res.hasMore;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      tp.error = err;
    }
    tp.loading = false;
    this.drawTopupsList();
  },

  topupsHtml: function () {
    var tp = this.topups;
    return '<div class="orders-tools admin-tools">' +
        '<div class="field">' +
          '<label class="field-label" for="admin-topup-status">' + escHtml(t('admin_filter_stage')) + '</label>' +
          '<select class="input" id="admin-topup-status" onchange="PageAdmin.setTopupStatus(this.value)">' +
            this.TOPUP_STATUSES.map(function (st) {
              return '<option value="' + st + '"' + (st === tp.status ? ' selected' : '') + '>' + escHtml(st === 'all' ? t('admin_filter_all') : t('topup_status_' + st)) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="admin-topups-list"></div>';
  },

  setTopupStatus: function (value) {
    this.topups.status = value;
    this.loadTopups(false);
  },

  customerName: function (r) {
    var c = r.customer || {};
    return c.clinic_name || c.nickname || String(r.user_id || '').slice(0, 8);
  },

  drawTopupsList: function () {
    var box = document.getElementById('admin-topups-list');
    if (!box) return;
    var tp = this.topups;
    var self = this;
    if (tp.error) { box.innerHTML = this.errorBox('PageAdmin.loadTopups(false)', tp.error); return; }
    if (!tp.rows.length && tp.loading) { box.innerHTML = '<div class="card">' + uiLoading() + '</div>'; return; }
    if (!tp.rows.length) { box.innerHTML = '<div class="card"><p class="empty-text">' + escHtml(t('admin_no_topups')) + '</p></div>'; return; }

    var table = '<div class="table-wrap admin-table-wrap"><table class="table admin-table"><thead><tr>' +
      '<th>' + escHtml(t('topup_request_no')) + '</th><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('topup_package')) + '</th>' +
      '<th>' + escHtml(t('topup_total')) + '</th><th>' + escHtml(t('admin_requested')) + '</th><th>' + escHtml(t('col_status')) + '</th></tr></thead><tbody>' +
      tp.rows.map(function (r) {
        return '<tr class="clickable" tabindex="0" onclick="PageAdmin.openTopup(\'' + escHtml(r.id) + '\')" onkeydown="if(event.key===\'Enter\')PageAdmin.openTopup(\'' + escHtml(r.id) + '\')">' +
          '<td class="mono nowrap"><b>' + escHtml(r.id) + '</b></td>' +
          '<td>' + escHtml(self.customerName(r)) + '</td>' +
          '<td class="mono">' + formatNumber(r.credits) + '</td>' +
          '<td class="mono nowrap">' + formatTHB(r.total) + '</td>' +
          '<td class="nowrap">' + escHtml(formatDateTime(r.created_at)) + '</td>' +
          '<td>' + uiTopupBadge(r.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var cards = '<ul class="admin-order-cards">' + tp.rows.map(function (r) {
      return '<li><button type="button" class="card admin-order-card" onclick="PageAdmin.openTopup(\'' + escHtml(r.id) + '\')">' +
        '<span class="order-top"><span class="order-id mono">' + escHtml(r.id) + '</span>' + uiTopupBadge(r.status) + '</span>' +
        '<span class="admin-card-clinic">' + escHtml(self.customerName(r)) + '</span>' +
        '<span class="order-meta"><span><span class="mono">' + formatNumber(r.credits) + '</span> ' + escHtml(t('credit_unit')) + '</span>' +
        '<span class="mono">' + formatTHB(r.total) + '</span><span>' + escHtml(formatDateTime(r.created_at)) + '</span></span>' +
        '</button></li>';
    }).join('') + '</ul>';

    box.innerHTML = table + cards +
      (tp.hasMore ? '<div class="load-more"><button type="button" class="btn btn-outline btn-lg" onclick="PageAdmin.loadTopups(true)"' + (tp.loading ? ' disabled' : '') + '>' +
        escHtml(tp.loading ? t('loading') : t('load_more')) + '</button></div>' : '');
  },

  openTopup: function (id) {
    var row = this.topups.rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    var self = this;
    var st = { row: row, busy: false, slipUrl: null, slipError: false, modal: null };
    this.topupDetail = st;
    st.modal = uiModal({
      title: t('admin_topup_detail') + ' · ' + row.id,
      body: uiLoading(),
      wide: true,
      onClose: function () { if (self.topupDetail === st) self.topupDetail = null; }
    });
    this.drawTopupDetail();
    cncAdminSlipUrl(row.slip_path).then(function (url) {
      st.slipUrl = url;
      self.drawTopupDetail();
    }).catch(function (err) {
      console.error(err);
      st.slipError = true;
      self.drawTopupDetail();
    });
  },

  drawTopupDetail: function () {
    var st = this.topupDetail;
    if (!st || !st.modal) return;
    var body = st.modal.el.querySelector('.modal-body');
    if (!body) return;
    var r = st.row;
    var dis = st.busy ? ' disabled' : '';
    function row(labelKey, value, mono) {
      return '<div class="review-row"><span class="review-label">' + escHtml(t(labelKey)) + '</span><span class="review-value' + (mono ? ' mono' : '') + '">' + value + '</span></div>';
    }
    var slip;
    if (st.slipError) slip = '<p class="error-text">' + escHtml(t('stl_load_error')) + '</p>';
    else if (!st.slipUrl) slip = uiLoading();
    else if (fileKind(r.slip_path) === 'image' || /\.(webp|heic|heif)$/i.test(r.slip_path)) {
      slip = '<a href="' + escHtml(st.slipUrl) + '" target="_blank" rel="noopener" class="slip-big"><img src="' + escHtml(st.slipUrl) + '" alt="' + escHtml(t('topup_slip_preview')) + '"></a>';
    } else {
      slip = '<a class="btn btn-outline" href="' + escHtml(st.slipUrl) + '" target="_blank" rel="noopener">📄 ' + escHtml(t('admin_open_slip')) + '</a>';
    }

    var actions = '';
    if (r.status === 'pending') {
      actions = '<div class="action-box highlight admin-actions">' +
        (st.busy ? '<p><span class="spinner" aria-hidden="true"></span> ' + escHtml(t('admin_processing')) + '</p>'
          : '<p>' + escHtml(t('admin_topup_check')) + '</p>' +
            '<div class="action-row">' +
              '<button type="button" class="btn btn-primary btn-lg" onclick="PageAdmin.approveTopup()"' + dis + '>✅ ' + escHtml(t('admin_approve')) + '</button>' +
              '<button type="button" class="btn btn-outline btn-lg btn-discard" onclick="PageAdmin.rejectTopup()"' + dis + '>' + escHtml(t('admin_reject')) + '</button>' +
            '</div>') +
        '</div>';
    } else if (r.status === 'rejected') {
      actions = '<div class="action-box"><p>' + uiTopupBadge('rejected') + ' ' + escHtml(r.reject_reason || '') + '</p></div>';
    } else {
      actions = '<div class="action-box"><p>' + uiTopupBadge(r.status) + (r.reviewed_at ? ' · ' + escHtml(formatDateTime(r.reviewed_at)) : '') + '</p></div>';
    }

    body.innerHTML = '<div class="admin-detail">' + actions +
      '<div class="admin-detail-grid">' +
        '<section>' +
          row('admin_customer', escHtml(this.customerName(r))) +
          row('topup_package', formatNumber(r.credits) + ' ' + escHtml(t('credit_unit')), true) +
          row('topup_each_label', formatTHB(r.unit_price), true) +
          row('topup_subtotal', formatTHB(r.subtotal), true) +
          row('topup_vat_label', formatTHB(r.vat_amount), true) +
          row('topup_total', '<b>' + formatTHB(r.total) + '</b>', true) +
          row('admin_requested', escHtml(formatDateTime(r.created_at))) +
        '</section>' +
        '<section><h3 class="detail-title">' + escHtml(t('admin_slip')) + '</h3>' + slip + '</section>' +
      '</div></div>';
  },

  approveTopup: async function () {
    var st = this.topupDetail;
    if (!st || st.busy) return;
    var r = st.row;
    var ok = await uiConfirm({
      title: t('admin_approve'),
      message: tf('admin_approve_topup_msg', { n: formatNumber(r.credits), name: this.customerName(r), total: formatTHB(r.total) }),
      okLabel: t('admin_approve')
    });
    if (!ok) return;
    await this.runTopupAction(function () { return cncAdminApproveTopup(r.id); }, 'approved', 'admin_topup_approved');
  },

  rejectTopup: function () {
    var self = this;
    var st = this.topupDetail;
    if (!st || st.busy) return;
    var modal = uiModal({
      title: t('admin_reject'),
      body: '<div class="field"><label class="field-label" for="reject-topup-reason">' + escHtml(t('admin_reject_reason')) + ' <span class="required">*</span></label>' +
        '<textarea class="input textarea" id="reject-topup-reason" rows="3" maxlength="500" placeholder="' + escHtml(t('admin_reject_reason_ph')) + '"></textarea>' +
        '<div class="err-slot"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('admin_reject'), kind: 'danger', onClick: async function (close) {
          var ta = modal.el.querySelector('#reject-topup-reason');
          var reason = ta.value.trim();
          if (!reason) {
            ta.classList.add('invalid');
            modal.el.querySelector('.err-slot').innerHTML = uiFieldError('admin_cancel_reason_required');
            ta.focus();
            return;
          }
          close();
          await self.runTopupAction(function () { return cncAdminRejectTopup(st.row.id, reason); }, 'rejected', 'admin_topup_rejected', reason);
        } }
      ]
    });
  },

  runTopupAction: async function (fn, newStatus, successKey, reason) {
    var st = this.topupDetail;
    if (!st) return;
    st.busy = true;
    this.drawTopupDetail();
    try {
      await fn();
      st.row.status = newStatus;
      st.row.reviewed_at = new Date().toISOString();
      if (reason) st.row.reject_reason = reason;
      uiToast(t(successKey), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    st.busy = false;
    this.drawTopupDetail();
    this.loadTopups(false);
  },

  // ================================================================
  // Settings 탭 (패키지 가격 · 결제 정보)
  // ================================================================
  loadSettings: async function () {
    var sx = this.settingsTab;
    var token = ++this.loadToken;
    sx.error = false;
    this.drawBody();
    try {
      var res = await Promise.all([cncAdminListPackages(), cncGetPaymentSettings(), cncGetCompany(true), cncListLegalVersions()]);
      if (token !== this.loadToken) return;
      sx.packages = res[0];
      sx.settings = res[1];
      sx.company = res[2] || {};
      sx.versions = res[3] || [];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      sx.error = err;
    }
    this.drawBody();
  },

  settingsHtml: function () {
    var sx = this.settingsTab;
    if (sx.error) return this.errorBox('PageAdmin.loadSettings()', sx.error);
    if (!sx.packages || !sx.settings) return '<div class="card">' + uiLoading() + '</div>';
    var s = sx.settings;
    var vat = Number(s.vat_rate || 0);

    function input(id, labelKey, value, opts) {
      opts = opts || {};
      return '<div class="field' + (opts.span ? ' span-2' : '') + '"><label class="field-label" for="set-' + id + '">' + escHtml(t(labelKey)) + '</label>' +
        (opts.textarea
          ? '<textarea class="input textarea" id="set-' + id + '" rows="2" maxlength="500">' + escHtml(value || '') + '</textarea>'
          : '<input class="input' + (opts.mono ? ' mono' : '') + '" id="set-' + id + '" type="' + (opts.type || 'text') + '"' + (opts.step ? ' step="' + opts.step + '"' : '') + ' maxlength="100" value="' + escHtml(value == null ? '' : value) + '">') +
        (opts.help ? '<p class="field-help">' + escHtml(t(opts.help)) + '</p>' : '') +
        '<div class="err-slot" data-err="' + id + '"></div></div>';
    }

    var payment = '<section class="card">' +
      '<h2 class="card-title">' + escHtml(t('admin_payment_settings')) + '</h2>' +
      '<form class="form-grid two" onsubmit="PageAdmin.saveSettings(event)" novalidate>' +
        input('promptpay_id', 'topup_promptpay_id', s.promptpay_id, { mono: true, help: 'admin_promptpay_help' }) +
        input('vat_rate', 'admin_vat_rate', s.vat_rate, { type: 'number', step: '0.01' }) +
        input('bank_name', 'topup_bank', s.bank_name) +
        input('account_name', 'topup_account_name', s.account_name) +
        input('account_number', 'topup_account_number', s.account_number, { mono: true }) +
        input('note', 'admin_payment_note', s.note, { textarea: true, span: true }) +
        '<div class="span-2"><button type="submit" class="btn btn-primary btn-lg"' + (sx.saving ? ' disabled' : '') + '>' + escHtml(sx.saving ? t('saving') : t('pe_save')) + '</button></div>' +
      '</form></section>';

    var rows = sx.packages.map(function (p, i) {
      var price = cncPackagePrice(p, vat);
      return '<tr data-pkg="' + i + '"' + (p.active ? '' : ' class="pkg-off"') + '>' +
        '<td><input class="input mono" type="number" min="1" step="1" data-f="credits" value="' + escHtml(p.credits) + '" aria-label="' + escHtml(t('admin_pkg_credits')) + '"></td>' +
        '<td><input class="input mono" type="number" min="0" step="0.01" data-f="unit_price" value="' + escHtml(p.unit_price) + '" aria-label="' + escHtml(t('topup_each_label')) + '"></td>' +
        '<td class="mono nowrap">' + formatTHB(price.total) + '</td>' +
        '<td><input class="input mono" type="number" step="1" data-f="sort_order" value="' + escHtml(p.sort_order) + '" aria-label="' + escHtml(t('admin_pkg_order')) + '"></td>' +
        '<td><label class="checkbox"><input type="checkbox" data-f="active"' + (p.active ? ' checked' : '') + '> <span>' + escHtml(t('admin_pkg_active')) + '</span></label></td>' +
        '<td><button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.savePackage(' + i + ')">' + escHtml(t('pe_save')) + '</button></td>' +
        '</tr>';
    }).join('');

    var packages = '<section class="card">' +
      '<div class="card-head"><h2 class="card-title">' + escHtml(t('admin_packages')) + '</h2>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.addPackage()">+ ' + escHtml(t('admin_pkg_add')) + '</button></div>' +
      '<p class="card-desc">' + escHtml(tf('admin_packages_help', { vat: formatNumber(vat) })) + '</p>' +
      '<div class="table-wrap"><table class="table pkg-table"><thead><tr>' +
        '<th>' + escHtml(t('admin_pkg_credits')) + '</th><th>' + escHtml(t('topup_each_label')) + '</th><th>' + escHtml(t('topup_total_vat')) + '</th>' +
        '<th>' + escHtml(t('admin_pkg_order')) + '</th><th>' + escHtml(t('admin_pkg_active')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</section>';

    return '<div class="admin-settings">' + '<section class="card" id="line-groups"></section>' + this.companyHtml() + this.versionsHtml() + payment + packages + '</div>';
  },

  saveSettings: async function (event) {
    event.preventDefault();
    var sx = this.settingsTab;
    if (sx.saving) return;
    var v = function (id) { return document.getElementById('set-' + id).value.trim(); };
    var fields = { promptpay_id: v('promptpay_id'), bank_name: v('bank_name'), account_name: v('account_name'), account_number: v('account_number'), vat_rate: v('vat_rate'), note: v('note') };
    var errs = {};
    if (fields.promptpay_id && !isValidPromptPayId(fields.promptpay_id)) errs.promptpay_id = 'admin_err_promptpay';
    var vat = Number(fields.vat_rate);
    if (fields.vat_rate === '' || isNaN(vat) || vat < 0 || vat > 30) errs.vat_rate = 'admin_err_vat';
    var slots = document.querySelectorAll('.admin-settings [data-err]');
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = uiFieldError(errs[slots[i].getAttribute('data-err')]);
    if (Object.keys(errs).length) return;
    sx.saving = true;
    try {
      sx.settings = await cncAdminSaveSettings(fields);
      uiToast(t('admin_settings_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    sx.saving = false;
    this.drawBody();
  },

  readPackageRow: function (i) {
    var tr = document.querySelector('.pkg-table tr[data-pkg="' + i + '"]');
    var p = this.settingsTab.packages[i];
    if (!tr || !p) return null;
    return {
      id: p.id,
      credits: tr.querySelector('[data-f="credits"]').value,
      unit_price: tr.querySelector('[data-f="unit_price"]').value,
      sort_order: tr.querySelector('[data-f="sort_order"]').value,
      active: tr.querySelector('[data-f="active"]').checked
    };
  },

  savePackage: async function (i) {
    var data = this.readPackageRow(i);
    if (!data) return;
    var ok = await uiConfirm({
      title: t('admin_packages'),
      message: tf('admin_pkg_save_msg', { n: data.credits, price: formatTHB(data.unit_price) }),
      okLabel: t('pe_save')
    });
    if (!ok) return;
    try {
      var saved = await cncAdminSavePackage(data);
      this.settingsTab.packages[i] = saved;
      uiToast(t('admin_settings_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(err && err.code === 'DUPLICATE_PACKAGE' ? t('admin_err_duplicate_package') : uiErrorMessage(err), 'error');
    }
    this.loadSettings();
  },

  addPackage: function () {
    var sx = this.settingsTab;
    if (!sx.packages) return;
    if (sx.packages.some(function (p) { return !p.id; })) return;   // 저장 안 한 새 줄이 이미 있으면
    var maxOrder = sx.packages.reduce(function (m, p) { return Math.max(m, Number(p.sort_order) || 0); }, 0);
    sx.packages.push({ id: null, credits: '', unit_price: '', sort_order: maxOrder + 1, active: true });
    this.drawBody();
    var inputs = document.querySelectorAll('.pkg-table tr:last-child [data-f="credits"]');
    if (inputs[0]) inputs[0].focus();
  },

  // ================================================================
  // 고객 상세: 크레딧 묶음 + 현금 환불 계산기
  // ================================================================
  customerLotsHtml: function (st) {
    var html = '<h3 class="detail-title">' + escHtml(t('lots_title')) + '</h3>';
    if (!st.lots) return html + uiLoading();
    var lots = st.lots.filter(function (l) { return l.remaining > 0 && new Date(l.expires_at) > new Date(); });
    if (!lots.length) html += '<p class="muted">' + escHtml(t('lots_empty')) + '</p>';
    else html += '<div class="table-wrap"><table class="table lots-table"><thead><tr>' +
      '<th>' + escHtml(t('lots_charged')) + '</th><th>' + escHtml(t('lots_quantity')) + '</th><th>' + escHtml(t('lots_remaining')) + '</th>' +
      '<th>' + escHtml(t('topup_each_label')) + '</th><th>' + escHtml(t('lots_expires')) + '</th></tr></thead><tbody>' +
      lots.map(function (l) {
        var stt = cncExpiryState(l.expires_at);
        return '<tr class="' + (stt ? 'lot-' + stt : '') + '"><td class="nowrap">' + escHtml(formatDate(l.created_at)) + ' <span class="badge lot-src">' + escHtml(t('lot_source_' + l.source)) + '</span></td>' +
          '<td class="mono">' + formatNumber(l.quantity) + '</td><td class="mono"><b>' + formatNumber(l.remaining) + '</b></td>' +
          '<td class="mono nowrap">' + (Number(l.unit_price) ? formatTHB(l.unit_price) : '—') + '</td>' +
          '<td class="nowrap lot-exp">' + escHtml(formatDate(l.expires_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // 환불 계산기 (owner 만)
    if (!cncHasRole('owner')) {
      return html + '<p class="muted refund-locked"><span aria-hidden="true">🔒</span> ' + escHtml(t('role_refund_needs_owner')) + '</p>';
    }
    var rf = st.refund;
    html += '<div class="refund-box">' +
      '<div class="card-head"><h3 class="detail-title">🧮 ' + escHtml(t('admin_refund_calc')) + '</h3>' +
        (rf ? '' : '<button type="button" class="btn btn-outline" onclick="PageAdmin.openRefund()">' + escHtml(t('admin_refund_open')) + '</button>') + '</div>' +
      '<p class="muted">' + escHtml(t('admin_refund_rules')) + '</p>';
    if (rf) {
      if (rf.loading) html += uiLoading();
      else if (rf.error) html += '<p class="error-text">' + escHtml(uiErrorMessage(rf.error)) + '</p>';
      else {
        var q = rf.quote;
        html += '<div class="table-wrap"><table class="table refund-table"><thead><tr><th></th>' +
          '<th>' + escHtml(t('lots_charged')) + '</th><th>' + escHtml(t('lots_remaining')) + '</th><th>' + escHtml(t('admin_refund_used')) + '</th>' +
          '<th>' + escHtml(t('admin_refund_paid')) + '</th><th>' + escHtml(t('admin_refund_rule')) + '</th><th>' + escHtml(t('admin_refund_amount')) + '</th></tr></thead><tbody>' +
          q.lots.map(function (l) {
            var can = l.rule === 'full' || l.rule === 'recalculated';
            return '<tr><td>' + (can ? '<input type="checkbox" class="refund-pick" data-lot="' + escHtml(l.lot_id) + '"' + (rf.selected[l.lot_id] ? ' checked' : '') + ' onchange="PageAdmin.pickRefundLot(this)" aria-label="' + escHtml(t('admin_refund_pick')) + '">' : '') + '</td>' +
              '<td class="nowrap">' + escHtml(formatDate(l.created_at)) + '</td>' +
              '<td class="mono">' + formatNumber(l.remaining) + ' / ' + formatNumber(l.quantity) + '</td>' +
              '<td class="mono">' + formatNumber(l.used) + '</td>' +
              '<td class="mono nowrap">' + (Number(l.paid_total) ? formatTHB(l.paid_total) : '—') + '</td>' +
              '<td><span class="badge refund-rule ' + escHtml(l.rule) + '">' + escHtml(t('refund_rule_' + l.rule)) + '</span></td>' +
              '<td class="mono nowrap"><b>' + formatTHB(l.refundable) + '</b></td></tr>';
          }).join('') + '</tbody></table></div>';
        var max = this.refundMax(st);
        html += '<div class="form-grid two refund-form">' +
          '<div class="field"><label class="field-label" for="refund-amount">' + escHtml(t('admin_refund_amount')) + ' (THB)</label>' +
            '<input class="input mono" id="refund-amount" type="number" min="0" step="0.01" value="' + (rf.amount != null ? escHtml(rf.amount) : max.toFixed(2)) + '"' + (rf.busy ? ' disabled' : '') + '>' +
            '<p class="field-help">' + escHtml(tf('admin_refund_max', { amount: formatTHB(max) })) + '</p></div>' +
          '<div class="field"><label class="field-label" for="refund-note">' + escHtml(t('col_description')) + '</label>' +
            '<input class="input" id="refund-note" type="text" maxlength="200" placeholder="' + escHtml(t('admin_refund_note_ph')) + '"' + (rf.busy ? ' disabled' : '') + '></div>' +
          '</div>' +
          '<p class="notice notice-warn"><span aria-hidden="true">⚠</span> ' + escHtml(t('admin_refund_transfer_note')) + '</p>' +
          '<button type="button" class="btn btn-danger" onclick="PageAdmin.recordRefund()"' + (rf.busy || !max ? ' disabled' : '') + '>' + escHtml(rf.busy ? t('admin_processing') : t('admin_refund_record')) + '</button>';
      }
    }
    return html + '</div>';
  },

  openRefund: async function () {
    var st = this.customer;
    if (!st) return;
    st.refund = { loading: true, quote: null, selected: {}, amount: null, busy: false, error: null };
    this.drawCustomer();
    try {
      var q = await cncAdminRefundQuote(st.user.id);
      if (this.customer !== st) return;
      st.refund.quote = q;
      (q.lots || []).forEach(function (l) { if (l.rule === 'full' || l.rule === 'recalculated') st.refund.selected[l.lot_id] = true; });
    } catch (err) {
      console.error(err);
      st.refund.error = err;
    }
    st.refund.loading = false;
    this.drawCustomer();
  },

  refundMax: function (st) {
    var rf = st.refund;
    if (!rf || !rf.quote) return 0;
    return (rf.quote.lots || []).reduce(function (sum, l) { return sum + (rf.selected[l.lot_id] ? Number(l.refundable || 0) : 0); }, 0);
  },

  pickRefundLot: function (box) {
    var st = this.customer;
    if (!st || !st.refund) return;
    st.refund.selected[box.getAttribute('data-lot')] = box.checked;
    st.refund.amount = null;   // 고른 묶음이 바뀌면 최대 금액으로 다시 채워요
    this.drawCustomer();
  },

  recordRefund: async function () {
    var st = this.customer;
    if (!st || !st.refund || st.refund.busy) return;
    var rf = st.refund;
    var el = st.modal.el;
    var lotIds = Object.keys(rf.selected).filter(function (k) { return rf.selected[k]; });
    var amount = Number(el.querySelector('#refund-amount').value);
    var note = el.querySelector('#refund-note').value.trim();
    var max = this.refundMax(st);
    if (!lotIds.length) { uiToast(t('admin_err_no_lots'), 'error'); return; }
    if (isNaN(amount) || amount < 0 || amount > max + 0.005) { uiToast(t('admin_err_amount_too_high'), 'error'); return; }
    rf.amount = amount;
    var credits = (rf.quote.lots || []).reduce(function (sum, l) { return sum + (rf.selected[l.lot_id] ? Number(l.remaining || 0) : 0); }, 0);
    var ok = await uiConfirm({
      title: t('admin_refund_record'),
      message: tf('admin_refund_confirm', { amount: formatTHB(amount), n: credits, name: st.user.clinic_name || st.user.nickname || st.user.email }),
      okLabel: t('admin_refund_record'),
      danger: true
    });
    if (!ok) return;
    rf.busy = true;
    this.drawCustomer();
    try {
      var balance = await cncAdminRefundCash(st.user.id, lotIds, amount, note);
      if (balance != null) { st.user.balance = balance; this.syncUserBalance(st.user.id, balance); }
      uiToast(t('admin_refund_done'), 'success');
      st.refund = null;
    } catch (err) {
      console.error(err);
      rf.busy = false;
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawCustomer();
    this.loadCustomer();
  }
,

  // ================================================================
  // Settings: 회사 정보 (company_settings) — 법적 문서·푸터에 자동으로 들어가요
  // ================================================================
  companyHtml: function () {
    var c = this.settingsTab.company || {};
    var saving = this.settingsTab.savingCompany;
    function input(id, labelKey, value, opts) {
      opts = opts || {};
      return '<div class="field' + (opts.span ? ' span-2' : '') + '"><label class="field-label" for="co-' + id + '">' + escHtml(t(labelKey)) + '</label>' +
        '<input class="input" id="co-' + id + '" type="' + (opts.type || 'text') + '" maxlength="300" value="' + escHtml(c[id] || '') + '">' +
        '<div class="err-slot" data-co-err="' + id + '"></div></div>';
    }
    return '<section class="card">' +
      '<h2 class="card-title">' + escHtml(t('admin_company_info')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('admin_company_help')) + '</p>' +
      '<form class="form-grid two" onsubmit="PageAdmin.saveCompany(event)" novalidate>' +
        input('company_name', 'legal_company', c.company_name, { span: true }) +
        input('address', 'address_label', c.address, { span: true }) +
        input('tax_id', 'tax_id_label', c.tax_id) +
        input('phone', 'phone_label', c.phone, { type: 'tel' }) +
        input('email', 'email_label', c.email, { type: 'email' }) +
        input('dpo_email', 'legal_dpo_email', c.dpo_email, { type: 'email' }) +
        input('line_id', 'line_id_label', c.line_id) +
        '<div class="span-2"><button type="submit" class="btn btn-primary btn-lg"' + (saving ? ' disabled' : '') + '>' + escHtml(saving ? t('saving') : t('pe_save')) + '</button></div>' +
      '</form></section>';
  },

  saveCompany: async function (event) {
    event.preventDefault();
    var sx = this.settingsTab;
    if (sx.savingCompany) return;
    var v = function (id) { return document.getElementById('co-' + id).value.trim(); };
    var fields = { company_name: v('company_name'), address: v('address'), tax_id: v('tax_id'), phone: v('phone'), email: v('email'), dpo_email: v('dpo_email'), line_id: v('line_id') };
    var errs = {};
    ['email', 'dpo_email'].forEach(function (k) { if (fields[k] && !isValidEmail(fields[k])) errs[k] = 'err_email_invalid'; });
    var slots = document.querySelectorAll('[data-co-err]');
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = uiFieldError(errs[slots[i].getAttribute('data-co-err')]);
    if (Object.keys(errs).length) return;
    sx.savingCompany = true;
    try {
      sx.company = await cncAdminSaveCompany(fields);
      renderFooters();
      uiToast(t('admin_settings_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    sx.savingCompany = false;
    this.drawBody();
  },

  // ================================================================
  // Settings: 법적 문서 버전 (새 버전 → 약관·개인정보는 모든 사용자가 다시 동의)
  // ================================================================
  versionsHtml: function () {
    var list = this.settingsTab.versions || [];
    var today = cncToday();
    var current = {};
    list.forEach(function (v) { if (!current[v.doc]) current[v.doc] = v; });
    return '<section class="card">' +
      '<h2 class="card-title">' + escHtml(t('admin_legal_versions')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('admin_legal_versions_help')) + '</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>' + escHtml(t('admin_legal_doc')) + '</th><th>' + escHtml(t('legal_version')) + '</th><th>' + escHtml(t('legal_effective')) + '</th><th></th></tr></thead><tbody>' +
        LEGAL_DOCS_LIST.map(function (d) {
          var v = current[d.doc];
          return '<tr><td><b>' + escHtml(t(d.titleKey)) + '</b></td><td class="mono">' + escHtml(v ? v.version : '—') + '</td>' +
            '<td>' + escHtml(v ? formatDate(v.effective_date) : '—') + '</td>' +
            '<td><a href="#/' + d.route + '" target="_blank" rel="noopener" class="btn btn-outline btn-sm">' + escHtml(t('admin_legal_view')) + '</a></td></tr>';
        }).join('') + '</tbody></table></div>' +
      '<form class="form-grid two legal-version-form" onsubmit="PageAdmin.addLegalVersion(event)" novalidate>' +
        '<div class="field"><label class="field-label" for="lv-doc">' + escHtml(t('admin_legal_doc')) + '</label>' +
          '<select class="input" id="lv-doc">' + LEGAL_DOCS_LIST.map(function (d) { return '<option value="' + d.doc + '">' + escHtml(t(d.titleKey)) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="field-label" for="lv-version">' + escHtml(t('legal_version')) + '</label>' +
          '<input class="input mono" id="lv-version" type="text" maxlength="40" value="' + escHtml(today) + '"></div>' +
        '<div class="field"><label class="field-label" for="lv-date">' + escHtml(t('legal_effective')) + '</label>' +
          uiDateField({ id: 'lv-date', value: today, min: '' }) + '</div>' +
        '<div class="field form-actions"><button type="submit" class="btn btn-primary">' + escHtml(t('admin_legal_add')) + '</button></div>' +
      '</form>' +
      '</section>';
  },

  addLegalVersion: async function (event) {
    event.preventDefault();
    var doc = document.getElementById('lv-doc').value;
    var version = document.getElementById('lv-version').value.trim();
    var date = uiDateValue('lv-date');
    if (!version || !date) { uiToast(t('err_required'), 'error'); return; }
    var docInfo = LEGAL_DOCS_LIST.filter(function (d) { return d.doc === doc; })[0];
    var ok = await uiConfirm({
      title: t('admin_legal_add'),
      message: tf(doc === 'credit' ? 'admin_legal_add_msg_credit' : 'admin_legal_add_msg', { doc: t(docInfo.titleKey), version: version, date: formatDate(date) }),
      okLabel: t('admin_legal_add'),
      danger: doc !== 'credit'
    });
    if (!ok) return;
    try {
      await cncAdminAddLegalVersion(doc, version, date);
      uiToast(t('admin_legal_added'), 'success');
      // 관리자 본인도 새 버전에 다시 동의해야 해요
      APP.legal = await cncGetLegalVersions(true).catch(function () { return APP.legal; });
      APP.needsConsent = cncNeedsConsent(APP.profile, APP.legal);
    } catch (err) {
      console.error(err);
      uiToast(err && err.code === 'DUPLICATE_VERSION' ? t('admin_err_duplicate_version') : uiErrorMessage(err), 'error');
    }
    await this.loadSettings();
    updateConsentGate();
  },

  // ================================================================
  // Customers: 계정 삭제 요청
  // ================================================================
  loadDeletions: async function () {
    var dl = this.deletions;
    dl.error = false;
    this.drawDeletions();
    try {
      dl.rows = await cncAdminListDeletionRequests(dl.status);
    } catch (err) {
      console.error(err);
      dl.error = err;
    }
    this.drawDeletions();
  },

  setDeletionStatus: function (value) {
    this.deletions.status = value;
    this.deletions.rows = null;
    this.loadDeletions();
  },

  drawDeletions: function () {
    var box = document.getElementById('admin-deletions');
    if (!box) return;
    var dl = this.deletions;
    var html = '<div class="card-head"><h2 class="card-title">🗑 ' + escHtml(t('admin_deletions')) + '</h2>' +
      '<select class="input admin-deletion-filter" aria-label="' + escHtml(t('admin_filter_stage')) + '" onchange="PageAdmin.setDeletionStatus(this.value)">' +
        ['pending', 'all'].map(function (v) { return '<option value="' + v + '"' + (dl.status === v ? ' selected' : '') + '>' + escHtml(t(v === 'pending' ? 'deletion_status_pending' : 'admin_filter_all')) + '</option>'; }).join('') +
      '</select></div>' +
      '<p class="card-desc">' + escHtml(t('admin_deletions_help')) + '</p>';
    if (dl.error) html += '<p class="error-text">' + escHtml(uiErrorMessage(dl.error)) + '</p>';
    else if (!dl.rows) html += uiLoading();
    else if (!dl.rows.length) html += '<p class="muted">' + escHtml(t('admin_no_deletions')) + '</p>';
    else html += '<div class="table-wrap"><table class="table"><thead><tr><th>' + escHtml(t('admin_requested')) + '</th><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('delete_reason')) + '</th><th>' + escHtml(t('col_status')) + '</th><th></th></tr></thead><tbody>' +
      dl.rows.map(function (r) {
        var c = r.customer || {};
        return '<tr><td class="nowrap">' + escHtml(formatDateTime(r.created_at)) + '</td>' +
          '<td>' + escHtml(c.clinic_name || c.nickname || String(r.user_id).slice(0, 8)) + '</td>' +
          '<td class="pre">' + escHtml(r.reason || '—') + '</td>' +
          '<td><span class="badge deletion-' + escHtml(r.status) + '">' + escHtml(t('deletion_status_' + r.status)) + '</span>' +
            (r.admin_note ? '<p class="muted">' + escHtml(r.admin_note) + '</p>' : '') + '</td>' +
          '<td class="nowrap">' + (r.status === 'pending'
            ? '<button type="button" class="btn btn-primary btn-sm" onclick="PageAdmin.handleDeletion(' + Number(r.id) + ', \'done\')">' + escHtml(t('admin_deletion_done')) + '</button> ' +
              '<button type="button" class="btn btn-outline btn-sm btn-discard" onclick="PageAdmin.handleDeletion(' + Number(r.id) + ', \'rejected\')">' + escHtml(t('admin_reject')) + '</button>'
            : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    box.innerHTML = html;
  },

  handleDeletion: function (id, status) {
    var self = this;
    var modal = uiModal({
      title: status === 'done' ? t('admin_deletion_done') : t('admin_reject'),
      body: '<p class="modal-text">' + escHtml(t(status === 'done' ? 'admin_deletion_done_msg' : 'admin_deletion_reject_msg')) + '</p>' +
        '<div class="field"><label class="field-label" for="deletion-note">' + escHtml(t('col_description')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
        '<textarea class="input textarea" id="deletion-note" rows="2" maxlength="500"></textarea></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: status === 'done' ? t('admin_deletion_done') : t('admin_reject'), kind: status === 'done' ? 'primary' : 'danger', onClick: async function (close, btn) {
          btn.disabled = true;
          try {
            await cncAdminHandleDeletion(id, status, modal.el.querySelector('#deletion-note').value);
            close();
            uiToast(t('admin_settings_saved'), 'success');
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
          self.loadDeletions();
        } }
      ]
    });
  }

};
