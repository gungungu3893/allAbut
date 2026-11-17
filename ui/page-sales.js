// ================================================================
// allAbut — 영업 화면 (sql/023): 영업 홈 · 내 거래처 · 거래처 주문 · 거래처 입금 · 내 월별 매출 (+ 내 커미션은 page-admin-sales.js)
// ================================================================
// page-admin.js 의 PageAdmin 에 덧붙여요 (page-admin-sales.js 다음에 불러와요). 데이터는 cnc/cnc-staff.js (서버 함수가 "내 담당 거래처"만 돌려줘요)
//   탭: sales (영업 홈) · sclients (내 거래처) · sorders (거래처 주문) · spay (거래처 입금) · scomm (내 커미션) · srev (내 월별 매출)
//   직원 계정이면 위쪽 메뉴 줄(휴대폰 하단 탭 + ☰)에 바로, 고객 계정 팀원(owner 등)이 영업 담당을 겸하면 "영업" 탭 하나 + 안쪽 작은 메뉴
//   영업은 보기만 해요 (주문 · 충전을 대신 넣거나 단계를 바꿀 수 없어요). 환자 ID · 메모 · 파일 · 디자인 · 배송지 · Tax ID · 이메일은 안 보여요

Object.assign(PageAdmin, {
  SALES_VIEWS: [
    { tab: 'sales', key: 'snav_home' }, { tab: 'sclients', key: 'snav_clients' }, { tab: 'sorders', key: 'snav_orders' },
    { tab: 'spay', key: 'snav_payments' }, { tab: 'scomm', key: 'snav_commission' }, { tab: 'srev', key: 'snav_revenue' }
  ],
  shome: { data: null, error: null },
  sclients: { rows: null, error: null, q: '', sort: 'name' },
  sorders: { rows: null, error: null, stage: 'active', client: '', open: null },
  spay: { rows: null, pending: null, error: null, client: '', from: '', to: '' },
  srev: { months: null, error: null, sel: null, comm: null, commError: null },

  isSalesTab: function (id) {
    return ['sales', 'sclients', 'sorders', 'spay', 'scomm', 'srev'].indexOf(id || this.tab) !== -1;
  },

  // 고객 계정 팀원(탭 줄이 있을 때)용 영업 안쪽 메뉴 — 직원 계정은 위쪽 메뉴 줄에 이미 있어요
  salesSubNavHtml: function () {
    if (cncIsStaffAccount()) return '';
    var self = this;
    return '<div class="seg sales-subnav" role="tablist">' + this.SALES_VIEWS.map(function (v) {
      var on = self.tab === v.tab;
      return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setTab(\'' + v.tab + '\')">' + escHtml(t(v.key)) + '</button>';
    }).join('') + '</div>';
  },

  // 역할 첫 화면의 접는 도움말 "이 화면에서 할 수 있는 일" (직원 계정)
  staffHelpHtml: function (role) {
    if (!cncIsStaffAccount()) return '';
    return '<details class="card staff-help"><summary><span aria-hidden="true">💡</span> ' + escHtml(t('staff_help_title')) + '</summary>' +
      '<p>' + escHtml(t('staff_help_' + role)) + '</p></details>';
  },

  // ================================================================
  // 영업 홈
  // ================================================================
  loadSalesHome: async function () {
    var st = this.shome;
    var token = ++this.loadToken;
    st.error = null;
    this.drawBody();
    try {
      var d = await cncSalesSummary();
      if (token !== this.loadToken) return;
      st.data = d;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  salesHomeHtml: function () {
    var st = this.shome;
    var html = this.salesSubNavHtml() + this.staffHelpHtml('sales');
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesHome()', st.error);
    if (!st.data) return html + '<div class="card">' + uiLoading() + '</div>';
    var d = st.data;
    function card(label, valueHtml, tab) {
      return '<button type="button" class="card sales-stat" onclick="PageAdmin.setTab(\'' + tab + '\')">' +
        '<span class="sales-stat-label">' + escHtml(label) + '</span><span class="sales-stat-value">' + valueHtml + '</span></button>';
    }
    html += '<h2 class="dash-section-title">' + escHtml(tf('sales_home_month', { month: this.monthLabel(d.year, d.month - 1) })) + '</h2>' +
      '<div class="sales-stats">' +
        card(t('sales_month_amount'), this.thbHtml(d.amount), 'srev') +
        card(t('sales_month_commission'), this.thbHtml(d.commission), 'scomm') +
        card(t('sales_clients_n'), '<span class="mono">' + formatNumber(d.clients) + '</span>', 'sclients') +
        card(t('sales_active_orders'), '<span class="mono">' + formatNumber(d.activeOrders) + '</span>', 'sorders') +
      '</div>' +
      (d.pendingTopups ? '<p class="notice notice-info"><span aria-hidden="true">⏳</span> ' + escHtml(tf('sales_pending_topups_n', { n: d.pendingTopups })) +
        ' <button type="button" class="link-btn" onclick="PageAdmin.setTab(\'spay\')">' + escHtml(t('snav_payments')) + ' →</button></p>' : '');
    html += '<section class="card"><h2 class="card-title">' + escHtml(t('sales_recent')) + '</h2>';
    if (!d.recent.length) html += '<p class="muted">' + escHtml(t('sales_recent_empty')) + '</p>';
    else {
      html += '<ul class="sales-recent">' + d.recent.slice(0, 15).map(function (r) {
        var isOrder = r.kind === 'order';
        return '<li><span class="sales-recent-icon" aria-hidden="true">' + (isOrder ? '📋' : '💳') + '</span>' +
          '<span class="sales-recent-main"><b>' + escHtml(r.customer || '') + '</b> · ' +
            escHtml(isOrder ? tf('sales_recent_order', { n: r.teeth || 0 }) : t('sales_recent_payment')) +
            (isOrder ? ' <span class="mono">' + escHtml(r.id) + '</span>' : ' <span class="mono">' + escHtml(formatTHB(r.amount)) + '</span>') + '</span>' +
          '<span class="muted nowrap">' + escHtml(formatDateTime(r.at)) + '</span></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';
    return html;
  },

  // ================================================================
  // 내 거래처
  // ================================================================
  loadSalesClients: async function () {
    var st = this.sclients;
    var token = ++this.loadToken;
    st.error = null;
    this.drawBody();
    try {
      var rows = await cncSalesClients();
      if (token !== this.loadToken) return;
      st.rows = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  salesClientsHtml: function () {
    var st = this.sclients;
    var html = this.salesSubNavHtml();
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesClients()', st.error);
    html += '<section class="card"><h2 class="card-title">🏥 ' + escHtml(t('snav_clients')) + '</h2>' +
      '<p class="field-help">' + escHtml(t('sales_clients_help')) + '</p>' +
      '<div class="orders-tools">' +
        '<div class="search-box"><label class="sr-only" for="sc-search">' + escHtml(t('sales_search')) + '</label><span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input class="input" id="sc-search" type="search" maxlength="60" value="' + escHtml(st.q) + '" placeholder="' + escHtml(t('sales_search')) + '" oninput="PageAdmin.setSalesClientQ(this.value)"></div>' +
        '<div class="field"><label class="field-label" for="sc-sort">' + escHtml(t('sales_sort')) + '</label>' +
          '<select class="input" id="sc-sort" onchange="PageAdmin.setSalesClientSort(this.value)">' +
          ['name', 'recent_order', 'recent_payment', 'month_amount', 'joined'].map(function (k) {
            return '<option value="' + k + '"' + (st.sort === k ? ' selected' : '') + '>' + escHtml(t('sales_sort_' + k)) + '</option>';
          }).join('') + '</select></div>' +
      '</div><div id="sc-list">' + this.salesClientsListHtml() + '</div></section>';
    return html;
  },

  salesClientsListHtml: function () {
    var st = this.sclients;
    if (!st.rows) return uiLoading();
    var q = st.q.trim().toLowerCase();
    var rows = st.rows.filter(function (c) {
      return !q || [c.clinic, c.name, c.phone, c.region].some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
    });
    var key = { recent_order: 'last_order_at', recent_payment: 'last_payment_at', joined: 'created_at' }[st.sort];
    rows.sort(function (a, b) {
      if (st.sort === 'month_amount') return (Number(b.month_amount) || 0) - (Number(a.month_amount) || 0);
      if (key) return String(b[key] || '').localeCompare(String(a[key] || ''));
      return String(a.clinic || '').localeCompare(String(b.clinic || ''));
    });
    if (!rows.length) return '<p class="muted">' + escHtml(t(st.rows.length ? 'sales_no_match' : 'sales_no_clients')) + '</p>';
    var d = function (v) { return v ? escHtml(formatDate(v)) : '<span class="muted">—</span>'; };
    return '<p class="muted admin-count">' + escHtml(tf('sales_clients_count', { n: rows.length })) + '</p>' +
      '<div class="table-wrap"><table class="table sales-clients-table"><thead><tr>' +
      '<th>' + escHtml(t('clinic_name')) + '</th><th>' + escHtml(t('sales_contact')) + '</th><th>' + escHtml(t('phone_label')) + '</th>' +
      '<th>' + escHtml(t('sales_region')) + '</th><th>' + escHtml(t('admin_joined')) + '</th><th>' + escHtml(t('sales_last_order')) + '</th>' +
      '<th>' + escHtml(t('sales_last_payment')) + '</th><th>' + escHtml(t('sales_month_amount')) + '</th><th>' + escHtml(t('credit_balance')) + '</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><td><b>' + escHtml(c.clinic || '') + '</b>' + (Number(c.active_orders) ? ' <span class="badge">' + escHtml(tf('sales_active_n', { n: c.active_orders })) + '</span>' : '') + '</td>' +
          '<td>' + escHtml(c.name || '') + '</td><td class="mono nowrap">' + escHtml(c.phone || '') + '</td><td>' + escHtml(c.region || '') + '</td>' +
          '<td class="nowrap">' + d(c.created_at) + '</td><td class="nowrap">' + d(c.last_order_at) + '</td><td class="nowrap">' + d(c.last_payment_at) + '</td>' +
          '<td class="mono nowrap">' + escHtml(formatTHB(c.month_amount)) + '</td>' +
          '<td class="nowrap">🔩 <span class="mono">' + formatNumber(c.balance || 0) + '</span>' +
            (Number(c.balance_crown_set) ? ' · 👑 <span class="mono">' + formatNumber(c.balance_crown_set) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  setSalesClientQ: function (v) {
    this.sclients.q = v;
    var box = document.getElementById('sc-list');
    if (box) box.innerHTML = this.salesClientsListHtml();
  },
  setSalesClientSort: function (v) {
    this.sclients.sort = v;
    var box = document.getElementById('sc-list');
    if (box) box.innerHTML = this.salesClientsListHtml();
  },

  // ================================================================
  // 거래처 주문 (읽기 전용)
  // ================================================================
  loadSalesOrders: async function () {
    var st = this.sorders;
    var token = ++this.loadToken;
    st.error = null;
    st.rows = null;
    this.drawBody();
    try {
      var res = await Promise.all([cncSalesClientOrders(null, null, st.stage), this.sclients.rows ? Promise.resolve(this.sclients.rows) : cncSalesClients().catch(function () { return []; })]);
      if (token !== this.loadToken) return;
      st.rows = res[0];
      this.sclients.rows = res[1];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  clientFilterHtml: function (id, current, fn) {
    var clients = this.sclients.rows || [];
    return '<div class="field"><label class="field-label" for="' + id + '">' + escHtml(t('sales_client_filter')) + '</label>' +
      '<select class="input" id="' + id + '" onchange="PageAdmin.' + fn + '(this.value)"><option value="">' + escHtml(t('sales_all_clients')) + '</option>' +
      clients.map(function (c) { return '<option value="' + escHtml(c.user_id) + '"' + (current === c.user_id ? ' selected' : '') + '>' + escHtml(c.clinic || c.name || '') + '</option>'; }).join('') +
      '</select></div>';
  },

  salesOrdersHtml: function () {
    var st = this.sorders;
    var self = this;
    var html = this.salesSubNavHtml();
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesOrders()', st.error);
    html += '<section class="card"><h2 class="card-title">📋 ' + escHtml(t('snav_orders')) + '</h2>' +
      '<p class="field-help">' + escHtml(t('sales_orders_help')) + '</p>' +
      '<div class="seg" role="tablist">' + ['active', 'done'].map(function (k) {
        var on = st.stage === k;
        return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setSalesOrderStage(\'' + k + '\')">' + escHtml(t(k === 'active' ? 'orders_tab_active' : 'orders_tab_done')) + '</button>';
      }).join('') + '</div>' +
      '<div class="orders-tools">' + this.clientFilterHtml('so-client', st.client, 'setSalesOrderClient') + '</div>';
    if (!st.rows) return html + uiLoading() + '</section>';
    var rows = st.rows.filter(function (o) { return !st.client || o.client_id === st.client; });
    if (!rows.length) return html + '<p class="muted">' + escHtml(t('sales_no_orders')) + '</p></section>';
    html += '<ul class="sales-orders">' + rows.map(function (o) {
      var open = st.open === o.id;
      return '<li class="card sales-order' + (open ? ' open' : '') + '">' +
        '<button type="button" class="sales-order-head" aria-expanded="' + open + '" onclick="PageAdmin.toggleSalesOrder(\'' + escHtml(o.id) + '\')">' +
          '<span class="mono">' + escHtml(o.id) + '</span> ' + uiStageBadge(o.stage) +
          '<span class="sales-order-meta"><b>' + escHtml(o.customer || '') + '</b> · ' + escHtml(formatDate(o.created_at)) + ' · ' +
            '<span class="mono">' + formatNumber(o.teeth) + '</span> ' + escHtml(t('teeth_unit')) +
            (o.crown_set ? ' (🔩 <span class="mono">' + formatNumber(o.abutment) + '</span> · 👑 <span class="mono">' + formatNumber(o.crown_set) + '</span>)' : '') +
            ' · ' + (o.deadline ? escHtml(t('deadline_label')) + ' ' + escHtml(formatDate(o.deadline)) : escHtml(t('deadline_tbd'))) + '</span></button>' +
        (open ? self.salesTimelineHtml(o) : '') + '</li>';
    }).join('') + '</ul></section>';
    return html;
  },

  // 단계 타임라인 (종류 · 날짜만 — 메모 · 처리자 이름은 서버가 안 보내요)
  salesTimelineHtml: function (o) {
    var items = [{ action: 'submitted', date: o.created_at }].concat(o.timeline || []);
    return '<ol class="sales-timeline">' + items.map(function (e) {
      var k = 'history_' + e.action;
      var label = t(k) === k ? (t('stage_' + e.action) === 'stage_' + e.action ? e.action : t('stage_' + e.action)) : t(k);
      return '<li><span class="nowrap">' + escHtml(formatDate(e.date)) + '</span> · ' + escHtml(label) + '</li>';
    }).join('') + '</ol>';
  },

  setSalesOrderStage: function (k) { this.sorders.stage = k; this.sorders.open = null; this.loadSalesOrders(); },
  setSalesOrderClient: function (v) { this.sorders.client = v; this.drawBody(); },
  toggleSalesOrder: function (id) { this.sorders.open = this.sorders.open === id ? null : id; this.drawBody(); },

  // ================================================================
  // 거래처 입금 (+ 대기 중인 충전 요청 — 금액 · 날짜만)
  // ================================================================
  loadSalesPayments: async function () {
    var st = this.spay;
    var token = ++this.loadToken;
    st.error = null;
    this.drawBody();
    try {
      var res = await Promise.all([cncSalesMyPayments(), cncSalesPendingTopups(),
        this.sclients.rows ? Promise.resolve(this.sclients.rows) : cncSalesClients().catch(function () { return []; })]);
      if (token !== this.loadToken) return;
      st.rows = res[0];
      st.pending = res[1];
      this.sclients.rows = res[2];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  salesPaymentsHtml: function () {
    var st = this.spay;
    var html = this.salesSubNavHtml();
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesPayments()', st.error);
    if (!st.rows) return html + '<div class="card">' + uiLoading() + '</div>';
    // 대기 중인 충전 요청
    if (st.pending && st.pending.length) {
      html += '<section class="card"><h2 class="card-title">⏳ ' + escHtml(tf('sales_pending_topups_n', { n: st.pending.length })) + '</h2><ul class="sales-recent">' +
        st.pending.map(function (p) {
          return '<li><span class="sales-recent-main"><b>' + escHtml(p.customer || '') + '</b> · <span class="mono">' + escHtml(formatTHB(p.total)) + '</span></span>' +
            '<span class="muted nowrap">' + escHtml(formatDateTime(p.created_at)) + '</span></li>';
        }).join('') + '</ul></section>';
    }
    var rows = st.rows.filter(function (p) {
      return (!st.client || p.client_id === st.client) && cncInDateRange(p.approved_at, st.from, st.to);
    });
    var sum = rows.reduce(function (a, p) { return a + (Number(p.subtotal) || 0); }, 0);
    html += '<section class="card"><h2 class="card-title">💳 ' + escHtml(t('snav_payments')) + '</h2>' +
      '<p class="field-help">' + escHtml(t('sales_my_payments_help')) + '</p>' +
      '<div class="orders-tools">' + this.clientFilterHtml('sp-client', st.client, 'setSalesPayClient') +
        '<div class="field"><span class="field-label">' + escHtml(t('sales_from')) + '</span>' + uiDateField({ id: 'sp-from', value: st.from, onChange: 'PageAdmin.setSalesPayRange' }) + '</div>' +
        '<div class="field"><span class="field-label">' + escHtml(t('sales_to')) + '</span>' + uiDateField({ id: 'sp-to', value: st.to, onChange: 'PageAdmin.setSalesPayRange' }) + '</div>' +
        (st.from || st.to || st.client ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.clearSalesPayFilter()">' + escHtml(t('sales_clear_filter')) + '</button>' : '') +
      '</div>' +
      '<p class="muted">' + escHtml(tf('sales_pay_total', { n: rows.length })) + ' <span class="mono">' + escHtml(formatTHB(sum)) + '</span></p>';
    if (!rows.length) html += '<p class="muted">' + escHtml(t('comm_no_payments')) + '</p>';
    else {
      html += '<div class="table-wrap"><table class="table sales-payments-table"><thead><tr>' +
        '<th>' + escHtml(t('comm_approved_date')) + '</th><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('topup_request_no')) + '</th>' +
        '<th>' + escHtml(t('topup_package')) + '</th><th>' + escHtml(t('comm_amount')) + '</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr><td class="nowrap">' + escHtml(formatDate(p.approved_at)) + '</td><td>' + escHtml(p.customer || '') + '</td>' +
            '<td class="mono nowrap">' + escHtml(p.id) + '</td>' +
            '<td class="nowrap"><span class="mono">' + escHtml(formatNumber(p.credits)) + '</span> ' + escHtml(t('credit_unit')) +
              (p.product === 'crown_set' ? ' ' + uiProductBadge('crown_set') : '') + '</td>' +
            '<td class="mono nowrap">' + escHtml(formatTHB(p.subtotal)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return html + '</section>';
  },

  setSalesPayClient: function (v) { this.spay.client = v; this.drawBody(); },
  setSalesPayRange: function () {
    this.spay.from = uiDateValue('sp-from') || '';
    this.spay.to = uiDateValue('sp-to') || '';
    this.drawBody();
  },
  clearSalesPayFilter: function () { this.spay.client = ''; this.spay.from = ''; this.spay.to = ''; this.drawBody(); },

  // ================================================================
  // 내 월별 매출 (최근 12달 막대 + 선택한 달의 거래처별 표)
  // ================================================================
  loadSalesRevenue: async function () {
    var st = this.srev;
    var token = ++this.loadToken;
    st.error = null;
    this.drawBody();
    try {
      var months = await cncSalesRevenue(12);
      if (token !== this.loadToken) return;
      st.months = months;
      if (!st.sel && months.length) st.sel = { year: months[months.length - 1].year, month: months[months.length - 1].month };
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
    this.loadRevenueMonth();
  },

  loadRevenueMonth: async function () {
    var st = this.srev;
    if (!st.sel) return;
    st.comm = null;
    st.commError = null;
    var sel = st.sel;
    try {
      var c = await cncMyCommissionMonth(sel.year, sel.month);
      if (st.sel !== sel) return;
      st.comm = c;
    } catch (err) {
      st.commError = err;
    }
    if (this.tab === 'srev') this.drawBody();
  },

  selectRevenueMonth: function (y, m) {
    this.srev.sel = { year: y, month: m };
    this.drawBody();
    this.loadRevenueMonth();
  },

  revenueChartHtml: function (months) {
    var self = this;
    var sel = this.srev.sel || {};
    var box = document.getElementById('admin-body');
    var W = Math.max(300, Math.min(1400, (box ? box.clientWidth : 720) - 40));
    var H = 240, padL = 8, padR = 8, padT = 28, padB = 46;
    var n = months.length || 1;
    var slot = (W - padL - padR) / n;
    var barW = Math.max(10, Math.min(56, slot * 0.56));
    var max = Math.max.apply(null, months.map(function (x) { return Math.max(x.amount, x.commission); }).concat([1]));
    var plotH = H - padT - padB;
    function y(v) { return padT + plotH - (Math.max(0, v) / max) * plotH; }
    var rtl = document.documentElement.dir === 'rtl';
    function cx(i) { var k = rtl ? n - 1 - i : i; return padL + slot * k + slot / 2; }
    var bars = '', labels = '', pts = [], dots = '';
    months.forEach(function (x, i) {
      var on = x.year === sel.year && x.month === sel.month;
      var by = y(x.amount);
      var bh = Math.max(x.amount ? 3 : 0, padT + plotH - by);
      var label = self.monthLabel(x.year, x.month - 1) + ' · ' + t('sales_rev_amount') + ' ' + formatTHB(x.amount) + ' · ' + t('sales_month_commission') + ' ' + formatTHB(x.commission);
      bars += '<g class="fin-bar-g' + (on ? ' selected' : '') + '" role="button" tabindex="0" aria-label="' + escHtml(label) + '" ' +
        'onclick="PageAdmin.selectRevenueMonth(' + x.year + ', ' + x.month + ')" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();PageAdmin.selectRevenueMonth(' + x.year + ', ' + x.month + ')}">' +
        '<title>' + escHtml(label) + '</title>' +
        '<rect class="fin-hit" x="' + (cx(i) - slot / 2).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) + '" height="' + (plotH + padB) + '"></rect>' +
        '<rect class="fin-bar" x="' + (cx(i) - barW / 2).toFixed(1) + '" y="' + (padT + plotH - bh).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3"></rect></g>';
      labels += '<text class="fin-axis' + (on ? ' selected' : '') + '" x="' + cx(i).toFixed(1) + '" y="' + (H - padB + 20) + '" text-anchor="middle">' + escHtml(self.monthLabel(x.year, x.month - 1, true)) + '</text>';
      if (x.amount && slot >= 44) labels += '<text class="fin-val" x="' + cx(i).toFixed(1) + '" y="' + (padT + plotH - bh - 6).toFixed(1) + '" text-anchor="middle">' + escHtml(self.shortTHB(x.amount)) + '</text>';
      pts.push(cx(i).toFixed(1) + ',' + y(x.commission).toFixed(1));
      dots += '<circle class="fin-dot" cx="' + cx(i).toFixed(1) + '" cy="' + y(x.commission).toFixed(1) + '" r="4"></circle>';
    });
    return '<svg class="fin-chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + escHtml(t('snav_revenue')) + '">' +
      '<line class="fin-base" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + plotH) + '" y2="' + (padT + plotH) + '"></line>' +
      bars + '<polyline class="fin-line" points="' + pts.join(' ') + '"></polyline>' + dots + labels + '</svg>';
  },

  salesRevenueHtml: function () {
    var st = this.srev;
    var self = this;
    var html = this.salesSubNavHtml();
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesRevenue()', st.error);
    if (!st.months) return html + '<div class="card">' + uiLoading() + '</div>';
    html += '<section class="card"><div class="card-head"><h2 class="card-title">📈 ' + escHtml(t('snav_revenue')) + '</h2>' +
      '<span class="legend"><span class="legend-dot fin-legend-bar"></span>' + escHtml(t('sales_rev_amount')) +
      ' <span class="legend-line"></span>' + escHtml(t('sales_month_commission')) + '</span></div>' +
      '<p class="muted fin-chart-hint">' + escHtml(t('sales_rev_hint')) + '</p>' +
      '<div class="fin-chart-wrap">' + this.revenueChartHtml(st.months) + '</div>' +
      '<div class="table-wrap"><table class="table sales-rev-table"><thead><tr><th>' + escHtml(t('sales_month')) + '</th><th>' + escHtml(t('sales_rev_amount')) + '</th>' +
        '<th>' + escHtml(t('sales_rev_count')) + '</th><th>' + escHtml(t('comm_refund_deduction')) + '</th><th>' + escHtml(t('sales_month_commission')) + '</th></tr></thead><tbody>' +
        st.months.slice().reverse().map(function (m) {
          var on = st.sel && st.sel.year === m.year && st.sel.month === m.month;
          return '<tr class="clickable' + (on ? ' selected' : '') + '" tabindex="0" onclick="PageAdmin.selectRevenueMonth(' + m.year + ', ' + m.month + ')">' +
            '<td class="nowrap">' + escHtml(self.monthLabel(m.year, m.month - 1)) + '</td><td class="mono nowrap">' + escHtml(formatTHB(m.amount)) + '</td>' +
            '<td class="mono">' + formatNumber(m.payments) + '</td>' +
            '<td class="mono nowrap">' + (m.refundDeduction ? '<span class="minus">−' + escHtml(formatTHB(m.refundDeduction)) + '</span>' : '—') + '</td>' +
            '<td class="mono nowrap"><b>' + escHtml(formatTHB(m.commission)) + '</b></td></tr>';
        }).join('') + '</tbody></table></div></section>';
    // 선택한 달의 거래처별
    if (st.sel) {
      html += '<section class="card"><h2 class="card-title">' + escHtml(tf('sales_rev_by_client', { month: this.monthLabel(st.sel.year, st.sel.month - 1) })) + '</h2>';
      if (st.commError) html += '<p class="error-text">' + escHtml(uiErrorMessage(st.commError)) + '</p>';
      else if (!st.comm) html += uiLoading();
      else {
        var r = st.comm.reps[0];
        var byClient = cncRevenueByClient(r ? r.items : []);
        if (!byClient.length) html += '<p class="muted">' + escHtml(t('comm_no_payments')) + '</p>';
        else {
          html += '<div class="table-wrap"><table class="table"><thead><tr><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('sales_rev_count')) + '</th>' +
            '<th>' + escHtml(t('sales_rev_amount')) + '</th><th>' + escHtml(t('sales_month_commission')) + '</th></tr></thead><tbody>' +
            byClient.map(function (c) {
              return '<tr><td>' + escHtml(c.customer) + '</td><td class="mono">' + formatNumber(c.payments) + (c.refunds ? ' <span class="muted">(−' + formatNumber(c.refunds) + ')</span>' : '') + '</td>' +
                '<td class="mono nowrap">' + escHtml(formatTHB(c.amount)) + '</td><td class="mono nowrap">' + escHtml(formatTHB(c.commission)) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
      }
      html += '</section>';
    }
    return html;
  }
});
