// ================================================================
// allAbut — 영업 화면 (sql/023 · 024): "내 실적" 한 화면 + "내 거래처"
// ================================================================
// page-admin.js 의 PageAdmin 에 덧붙여요 (page-admin-sales.js 다음에 불러와요). 데이터는 전부 "내 담당"만 돌려주는 서버 함수.
//   탭: sales   = 내 실적 (#/admin/sales — 로그인하면 바로 여기, 들어올 때마다 이번 달)
//       sclients = 내 거래처 (치과명 · 담당자 · 전화 · 최근 주문일 · 최근 입금일 + 검색 한 칸)
//   예전 주소(#/admin/sorders · spay · scomm · srev)는 내 실적으로 (page-admin.js SALES_OLD_TABS)
// "내 실적" 화면 — 맨 위 ◀ 월 ▶ 하나로 전체가 같이 바뀌어요:
//   1) 큰 카드: 이 달 받을 커미션 (크게) + 작은 글씨로 입금 합계(VAT 제외) · 건수 · 환불 차감 · 지급 상태     ← my_commission_month
//   2) 내 고객 결제: 그 달에 승인된 입금 표 (날짜 · 치과명 · 상품 · 크레딧 · 금액 · 내 커미션 — 계산 근거는 눌렀을 때만) + 합계 줄
//   3) 내 고객 주문: 그 달에 접수된 주문 표 (접수일 · 치과명 · 주문번호 · 치아 수 · 지금 단계 · 납품일) + 합계 줄  ← sales_my_client_orders
//   4) 맨 아래 접이식 "지난 12개월 보기" (열 때 불러와요 — 막대 그래프 + 달별 표, 달을 누르면 그 달로)        ← sales_my_revenue
//   필터 · 검색 · 그래프(맨 위)는 없어요. 휴대폰에서는 표가 카드 목록으로 (.rtable, 가로 스크롤 없음)
//   환자 ID · 메모 · 파일 · 디자인 · 배송지 · 다른 영업의 데이터는 서버가 처음부터 안 줘요
// sql/023 을 아직 실행하지 않았으면 예전 영업 화면(page-admin-sales.js salesHtml) 그대로

Object.assign(PageAdmin, {
  SALES_VIEWS: [
    { tab: 'sales', key: 'snav_perf' }, { tab: 'sclients', key: 'snav_clients' }
  ],
  sperf: { year: null, month: null, comm: null, orders: null, firstRates: {}, error: null, missing: false, rev: null, revError: null, revOpen: false },
  sclients: { rows: null, error: null, q: '' },

  isSalesTab: function (id) {
    return ['sales', 'sclients'].indexOf(id || this.tab) !== -1;
  },

  // 고객 계정 팀원(owner 등이 영업 담당을 겸할 때 — 탭 줄이 있을 때)용 안쪽 메뉴 [내 실적] [내 거래처]
  //   직원 계정은 위쪽 메뉴 줄에 이미 있고, sql/023 전이면 새 화면이 없어서 안 보여요
  salesSubNavHtml: function () {
    if (cncIsStaffAccount() || this.sperf.missing) return '';
    var self = this;
    return '<div class="seg sales-subnav" role="tablist">' + this.SALES_VIEWS.map(function (v) {
      var on = self.tab === v.tab;
      return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setTab(\'' + v.tab + '\')">' + escHtml(t(v.key)) + '</button>';
    }).join('') + '</div>';
  },

  // 역할 첫 화면의 접는 도움말 "이 화면에서 할 수 있는 일" (직원 계정 — 기본은 접혀 있어요)
  staffHelpHtml: function (role) {
    if (!cncIsStaffAccount()) return '';
    return '<details class="card staff-help"><summary><span aria-hidden="true">💡</span> ' + escHtml(t('staff_help_title')) + '</summary>' +
      '<p>' + escHtml(t('staff_help_' + role)) + '</p></details>';
  },

  // ================================================================
  // 내 실적
  // ================================================================
  // 그 달의 방콕 날짜 범위 'YYYY-MM-DD'
  perfMonthRange: function (y, m) {
    var next = cncShiftMonth(y, m, 1);
    var last = new Date(Date.UTC(next.year, next.month - 1, 1) - 864e5).toISOString().slice(0, 10);
    return { from: y + '-' + String(m).padStart(2, '0') + '-01', to: last };
  },

  // 탭에 들어올 때마다 이번 달로 (page-admin.js 의 render · setTab → resetMonthTab)
  resetPerfMonth: function () {
    var st = this.sperf;
    st.year = null; st.month = null; st.comm = null; st.orders = null;
    st.revOpen = false;   // "지난 12개월 보기" 는 들어올 때마다 접힌 채로
  },

  loadSalesPerf: async function () {
    var st = this.sperf;
    if (st.year == null) { var now = cncBkkYearMonth(); st.year = now.year; st.month = now.month; }
    var token = ++this.loadToken;
    st.error = null;
    st.comm = null;
    st.orders = null;
    this.drawBody();
    var range = this.perfMonthRange(st.year, st.month);
    try {
      var res = await Promise.all([
        cncMyCommissionMonth(st.year, st.month),
        cncSalesClientOrders(range.from, range.to, null),
        cncRepFirstRateDates().catch(function () { return {}; })
      ]);
      if (token !== this.loadToken) return;
      st.comm = res[0];
      st.orders = res[1];
      st.firstRates = res[2] || {};
    } catch (err) {
      if (token !== this.loadToken) return;
      // sql/023 을 아직 실행하지 않았으면 → 예전 영업 화면(내 커미션 + 내 담당 입금) 그대로
      if (cncIsMissingFunction(err)) { st.missing = true; return this.loadSales(); }
      console.error(err);
      st.error = err;
    }
    this.drawBody();
  },

  shiftPerfMonth: function (delta) {
    var st = this.sperf;
    var n = cncShiftMonth(st.year, st.month, delta);
    var now = cncBkkYearMonth();
    if (n.year * 12 + n.month > now.year * 12 + now.month) return;   // 미래 달로는 못 가요
    st.year = n.year;
    st.month = n.month;
    this.loadSalesPerf();
  },

  perfJump: function (year, month) {
    var st = this.sperf;
    if (year == null) { var now = cncBkkYearMonth(); year = now.year; month = now.month; }
    st.year = year;
    st.month = month;
    this.loadSalesPerf();
    var top = document.getElementById('admin-body');
    if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  perfIsNow: function () {
    var now = cncBkkYearMonth();
    return this.sperf.year === now.year && this.sperf.month === now.month;
  },

  perfMonthNavHtml: function () {
    var st = this.sperf;
    var isNow = this.perfIsNow();
    return '<div class="month-nav perf-month-nav">' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.shiftPerfMonth(-1)" aria-label="' + escHtml(t('date_prev_month')) + '"><span class="arrow" aria-hidden="true">◀</span> ' + escHtml(t('admin_prev')) + '</button>' +
      '<div class="month-title-box"><h2 class="month-title">' + escHtml(this.monthLabel(st.year, st.month - 1)) + '</h2>' +
        (isNow ? '' : '<button type="button" class="btn btn-outline btn-sm month-now-btn" onclick="PageAdmin.perfJump()">' + escHtml(t('comm_this_month')) + '</button>') +
      '</div>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.shiftPerfMonth(1)"' + (isNow ? ' disabled' : '') + ' aria-label="' + escHtml(t('date_next_month')) + '">' + escHtml(t('admin_next')) + ' <span class="arrow" aria-hidden="true">▶</span></button>' +
      '</div>';
  },

  salesPerfHtml: function () {
    var st = this.sperf;
    if (st.missing) return this.salesHtml();   // sql/023 전: 예전 영업 화면
    var html = this.salesSubNavHtml() + (cncIsStaffAccount() ? this.staffHelpHtml('sales') : '') + this.perfMonthNavHtml();
    if (st.error) return html + this.errorBox('PageAdmin.loadSalesPerf()', st.error);
    if (!st.comm || !st.orders) return html + '<div class="card">' + uiLoading() + '</div>';
    var r = st.comm.reps[0] || { payments: 0, amount: 0, refunds: 0, refundDeduction: 0, commission: 0, credits: 0, paid: null, items: [], repId: '' };
    html += this.perfCardHtml(r) + this.perfPaymentsHtml(r) + this.perfOrdersHtml(st.orders) + this.perfHistoryHtml();
    return '<div class="sales-perf">' + html + '</div>';
  },

  // 1) 큰 카드: 이 달 받을 커미션
  perfCardHtml: function (r) {
    var st = this.sperf;
    var title = this.perfIsNow() ? t('sperf_comm_now') : tf('sperf_comm_month', { month: this.monthLabel(st.year, st.month - 1) });
    var status = r.paid
      ? '<span class="badge badge-green">✓ ' + escHtml(t('comm_paid')) + ' · ' + escHtml(formatDate(r.paid.paidAt)) + '</span>'
      : '<span class="badge comm-unpaid">' + escHtml(t('comm_unpaid')) + '</span>';
    return '<section class="card perf-card">' +
      '<p class="perf-card-label">' + escHtml(title) + '</p>' +
      '<p class="perf-card-value">' + this.thbHtml(r.commission) + '</p>' +
      '<p class="perf-card-sub">' +
        '<span>' + escHtml(t('sperf_pay_total')) + ' ' + this.thbHtml(r.amount) + '</span>' +
        '<span>' + escHtml(t('sperf_count')) + ' <span class="mono">' + escHtml(formatNumber(r.payments)) + '</span></span>' +
        '<span>' + escHtml(t('comm_refund_deduction')) + ' ' + (r.refundDeduction > 0 ? '<span class="minus">−' + this.thbHtml(r.refundDeduction) + '</span>' : this.thbHtml(0)) + '</span>' +
        '<span>' + status + '</span>' +
      '</p></section>';
  },

  // 비어 있는 표 대신 한 줄
  perfEmptyHtml: function () {
    return '<p class="muted perf-empty">' + escHtml(t('sperf_empty')) + '</p>';
  },

  // 2) 내 고객 결제 (입금 + 그 달 환불 차감 줄)
  perfPaymentsHtml: function (r) {
    var self = this;
    var items = (r.items || []).filter(function (i) { return i.kind === 'payment' || i.kind === 'refund'; });
    var html = '<section class="card"><h2 class="card-title">💳 ' + escHtml(t('sperf_payments_title')) + '</h2>';
    if (!items.length) return html + this.perfEmptyHtml() + '</section>';
    var firstRate = this.sperf.firstRates[r.repId];
    var sumCredits = 0, sumAmount = 0, sumComm = 0;
    var rows = items.map(function (i) {
      var refund = i.kind === 'refund';
      sumCredits += refund ? -i.credits : i.credits;
      sumAmount += refund ? -i.amount : i.amount;
      sumComm += i.commission;
      return '<tr class="' + (refund ? 'comm-refund-row' : '') + '">' +
        '<td data-label="' + escHtml(t('comm_date')) + '" class="nowrap">' + escHtml(formatDate(i.date)) +
          (refund ? ' <span class="badge comm-refund-badge">' + escHtml(t('comm_refund')) + '</span>' : '') + '</td>' +
        '<td data-label="' + escHtml(t('clinic_name')) + '"><b>' + escHtml(i.customer || '') + '</b></td>' +
        '<td data-label="' + escHtml(t('sperf_product')) + '">' + escHtml(uiProductName(i.product || 'abutment', true)) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_credits')) + '" class="nowrap"><span class="mono">' + escHtml(formatNumber(refund ? -i.credits : i.credits)) + '</span></td>' +
        '<td data-label="' + escHtml(t('sperf_amount')) + '" class="nowrap">' + (refund ? '<span class="minus">−' + self.thbHtml(i.amount) + '</span>' : self.thbHtml(i.amount)) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_my_comm')) + '" class="nowrap">' +
          '<details class="perf-basis"><summary><b>' + self.thbHtml(i.commission) + '</b> <span class="perf-basis-hint">' + escHtml(t('sperf_basis_show')) + '</span></summary>' +
          '<span class="perf-basis-text">' + self.basisHtml(i, firstRate) + '</span></details></td></tr>';
    }).join('');
    return html + '<div class="table-wrap rtable-wrap"><table class="table rtable perf-pay-table"><thead><tr>' +
      '<th>' + escHtml(t('comm_date')) + '</th><th>' + escHtml(t('clinic_name')) + '</th><th>' + escHtml(t('sperf_product')) + '</th>' +
      '<th>' + escHtml(t('sperf_credits')) + '</th><th>' + escHtml(t('sperf_amount')) + '</th><th>' + escHtml(t('sperf_my_comm')) + '</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr class="rtable-total">' +
        '<td data-label="">' + escHtml(t('sperf_total')) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_count')) + '"><span class="mono">' + escHtml(formatNumber(items.length)) + '</span></td>' +
        '<td class="rtable-skip"></td>' +
        '<td data-label="' + escHtml(t('sperf_credits')) + '" class="nowrap"><span class="mono">' + escHtml(formatNumber(sumCredits)) + '</span></td>' +
        '<td data-label="' + escHtml(t('sperf_amount')) + '" class="nowrap">' + (sumAmount < 0 ? '<span class="minus">−' + this.thbHtml(-sumAmount) + '</span>' : this.thbHtml(sumAmount)) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_my_comm')) + '" class="nowrap"><b>' + this.thbHtml(Math.round(sumComm * 100) / 100) + '</b></td>' +
      '</tr></tfoot></table></div>' +
      '<p class="field-help">' + escHtml(t('sperf_payments_help')) + '</p></section>';
  },

  // 3) 내 고객 주문 (그 달에 접수된 주문)
  perfOrdersHtml: function (orders) {
    var html = '<section class="card"><h2 class="card-title">📋 ' + escHtml(t('sperf_orders_title')) + '</h2>';
    if (!orders.length) return html + this.perfEmptyHtml() + '</section>';
    var teeth = 0;
    var rows = orders.map(function (o) {
      teeth += Number(o.teeth) || 0;
      return '<tr>' +
        '<td data-label="' + escHtml(t('sperf_received')) + '" class="nowrap">' + escHtml(formatDate(o.created_at)) + '</td>' +
        '<td data-label="' + escHtml(t('clinic_name')) + '"><b>' + escHtml(o.customer || '') + '</b></td>' +
        '<td data-label="' + escHtml(t('sperf_order_no')) + '" class="nowrap"><span class="mono">' + escHtml(o.id) + '</span></td>' +
        '<td data-label="' + escHtml(t('sperf_teeth')) + '" class="nowrap"><span class="mono">' + escHtml(formatNumber(o.teeth)) + '</span>' +
          (Number(o.crown_set) ? ' <span class="muted">(' + escHtml(uiProductName('crown_set', true)) + ' <span class="mono">' + escHtml(formatNumber(o.crown_set)) + '</span>)</span>' : '') + '</td>' +
        '<td data-label="' + escHtml(t('sperf_stage')) + '">' + uiStageBadge(o.stage) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_deadline')) + '" class="nowrap">' + (o.deadline ? escHtml(formatDate(o.deadline)) : '<span class="muted">' + escHtml(t('deadline_tbd')) + '</span>') + '</td></tr>';
    }).join('');
    return html + '<div class="table-wrap rtable-wrap"><table class="table rtable perf-order-table"><thead><tr>' +
      '<th>' + escHtml(t('sperf_received')) + '</th><th>' + escHtml(t('clinic_name')) + '</th><th>' + escHtml(t('sperf_order_no')) + '</th>' +
      '<th>' + escHtml(t('sperf_teeth')) + '</th><th>' + escHtml(t('sperf_stage')) + '</th><th>' + escHtml(t('sperf_deadline')) + '</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr class="rtable-total">' +
        '<td data-label="">' + escHtml(t('sperf_total')) + '</td>' +
        '<td data-label="' + escHtml(t('sperf_count')) + '"><span class="mono">' + escHtml(formatNumber(orders.length)) + '</span></td>' +
        '<td class="rtable-skip"></td>' +
        '<td data-label="' + escHtml(t('sperf_teeth')) + '"><span class="mono">' + escHtml(formatNumber(teeth)) + '</span></td>' +
        '<td class="rtable-skip"></td><td class="rtable-skip"></td>' +
      '</tr></tfoot></table></div>' +
      '<p class="field-help">' + escHtml(t('sales_orders_help')) + '</p></section>';
  },

  // 4) 지난 12개월 보기 (접혀 있다가 열 때 불러와요)
  perfHistoryHtml: function () {
    var st = this.sperf;
    var body;
    if (!st.revOpen) body = '';
    else if (st.revError) body = this.errorBox('PageAdmin.loadPerfHistory()', st.revError);
    else if (!st.rev) body = uiLoading();
    else body = this.perfHistoryBodyHtml(st.rev);
    return '<details class="card perf-history"' + (st.revOpen ? ' open' : '') + ' ontoggle="PageAdmin.togglePerfHistory(this.open)">' +
      '<summary><span aria-hidden="true">📈</span> ' + escHtml(t('sperf_history')) + '</summary>' +
      '<div id="perf-history-body">' + body + '</div></details>';
  },

  togglePerfHistory: function (open) {
    var st = this.sperf;
    if (st.revOpen === open) return;
    st.revOpen = open;
    if (!open) return;
    if (!st.rev) { this.loadPerfHistory(); return; }
    var box = document.getElementById('perf-history-body');   // 이미 불러온 적이 있으면 바로 그려요
    if (box) box.innerHTML = this.perfHistoryBodyHtml(st.rev);
  },

  loadPerfHistory: async function () {
    var st = this.sperf;
    st.revError = null;
    var box = document.getElementById('perf-history-body');
    if (box) box.innerHTML = uiLoading();
    try { st.rev = await cncSalesRevenue(12); }
    catch (err) { console.error(err); st.revError = err; }
    box = document.getElementById('perf-history-body');
    if (box) box.innerHTML = st.revError ? this.errorBox('PageAdmin.loadPerfHistory()', st.revError) : this.perfHistoryBodyHtml(st.rev);
  },

  perfHistoryBodyHtml: function (months) {
    var self = this;
    var st = this.sperf;
    var max = Math.max.apply(null, months.map(function (m) { return m.amount; }).concat([1]));
    // 막대 그래프 (CSS 막대 — 화면 폭에 맞게 줄어들어요). 막대를 누르면 그 달로
    var bars = '<div class="perf-bars" role="list">' + months.map(function (m) {
      var on = m.year === st.year && m.month === st.month;
      var h = m.amount > 0 ? Math.max(4, Math.round(m.amount / max * 100)) : 0;
      var label = self.monthLabel(m.year, m.month - 1) + ' · ' + t('sales_rev_amount') + ' ' + formatTHB(m.amount) + ' · ' + t('sales_month_commission') + ' ' + formatTHB(m.commission);
      return '<button type="button" role="listitem" class="perf-bar' + (on ? ' selected' : '') + '" title="' + escHtml(label) + '" aria-label="' + escHtml(label) + '" onclick="PageAdmin.perfJump(' + m.year + ', ' + m.month + ')">' +
        '<span class="perf-bar-fill" style="height:' + h + '%"></span>' +
        '<span class="perf-bar-label">' + escHtml(self.monthLabel(m.year, m.month - 1, true)) + '</span></button>';
    }).join('') + '</div>';
    var table = '<div class="table-wrap rtable-wrap"><table class="table rtable perf-hist-table"><thead><tr>' +
      '<th>' + escHtml(t('sales_month')) + '</th><th>' + escHtml(t('sales_rev_amount')) + '</th><th>' + escHtml(t('sales_rev_count')) + '</th>' +
      '<th>' + escHtml(t('comm_refund_deduction')) + '</th><th>' + escHtml(t('sales_month_commission')) + '</th></tr></thead><tbody>' +
      months.slice().reverse().map(function (m) {
        var on = m.year === st.year && m.month === st.month;
        return '<tr class="clickable' + (on ? ' selected' : '') + '" tabindex="0" onclick="PageAdmin.perfJump(' + m.year + ', ' + m.month + ')" ' +
          'onkeydown="if(event.key===\'Enter\'){PageAdmin.perfJump(' + m.year + ', ' + m.month + ')}">' +
          '<td data-label="' + escHtml(t('sales_month')) + '" class="nowrap"><b>' + escHtml(self.monthLabel(m.year, m.month - 1)) + '</b></td>' +
          '<td data-label="' + escHtml(t('sales_rev_amount')) + '" class="nowrap">' + self.thbHtml(m.amount) + '</td>' +
          '<td data-label="' + escHtml(t('sales_rev_count')) + '"><span class="mono">' + escHtml(formatNumber(m.payments)) + '</span></td>' +
          '<td data-label="' + escHtml(t('comm_refund_deduction')) + '" class="nowrap">' + (m.refundDeduction ? '<span class="minus">−' + self.thbHtml(m.refundDeduction) + '</span>' : '<span class="muted">—</span>') + '</td>' +
          '<td data-label="' + escHtml(t('sales_month_commission')) + '" class="nowrap"><b>' + self.thbHtml(m.commission) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<p class="field-help">' + escHtml(t('sperf_history_help')) + '</p>' + bars + table;
  },

  // ================================================================
  // 내 거래처 (치과명 · 담당자 · 전화 · 최근 주문일 · 최근 입금일 + 검색 한 칸)
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
      '<div class="search-box sales-client-search"><label class="sr-only" for="sc-search">' + escHtml(t('sales_search')) + '</label><span class="search-icon" aria-hidden="true">🔍</span>' +
        '<input class="input" id="sc-search" type="search" maxlength="60" value="' + escHtml(st.q) + '" placeholder="' + escHtml(t('sales_search')) + '" oninput="PageAdmin.setSalesClientQ(this.value)"></div>' +
      '<div id="sc-list">' + this.salesClientsListHtml() + '</div></section>';
    return html;
  },

  salesClientsListHtml: function () {
    var st = this.sclients;
    if (!st.rows) return uiLoading();
    var q = st.q.trim().toLowerCase();
    var rows = st.rows.filter(function (c) {
      return !q || [c.clinic, c.name, c.phone].some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
    }).sort(function (a, b) { return String(a.clinic || '').localeCompare(String(b.clinic || '')); });
    if (!rows.length) return '<p class="muted">' + escHtml(t(st.rows.length ? 'sales_no_match' : 'sales_no_clients')) + '</p>';
    var d = function (v) { return v ? escHtml(formatDate(v)) : '<span class="muted">—</span>'; };
    return '<p class="muted admin-count">' + escHtml(tf('sales_clients_count', { n: rows.length })) + '</p>' +
      '<div class="table-wrap rtable-wrap"><table class="table rtable sales-clients-table"><thead><tr>' +
      '<th>' + escHtml(t('clinic_name')) + '</th><th>' + escHtml(t('sales_contact')) + '</th><th>' + escHtml(t('phone_label')) + '</th>' +
      '<th>' + escHtml(t('sales_last_order')) + '</th><th>' + escHtml(t('sales_last_payment')) + '</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><td data-label="' + escHtml(t('clinic_name')) + '"><b>' + escHtml(c.clinic || '') + '</b></td>' +
          '<td data-label="' + escHtml(t('sales_contact')) + '">' + escHtml(c.name || '') + '</td>' +
          '<td data-label="' + escHtml(t('phone_label')) + '" class="nowrap"><span class="mono">' + escHtml(c.phone || '') + '</span></td>' +
          '<td data-label="' + escHtml(t('sales_last_order')) + '" class="nowrap">' + d(c.last_order_at) + '</td>' +
          '<td data-label="' + escHtml(t('sales_last_payment')) + '" class="nowrap">' + d(c.last_payment_at) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  setSalesClientQ: function (v) {
    this.sclients.q = v;
    var box = document.getElementById('sc-list');
    if (box) box.innerHTML = this.salesClientsListHtml();
  }
});
