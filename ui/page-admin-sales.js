// ================================================================
// allAbut — 관리자 화면: 영업 · 담당자 지정 · 커미션 (sql/015 역할 · 담당 · 요율 · 정산 + sql/016 수금 기준)
// ================================================================
// page-admin.js 의 PageAdmin 에 함수를 덧붙여요 (page-admin-team.js 다음에 불러와요). 로직은 cnc/cnc-sales.js
//   영업 탭     (#/admin/sales, 영업 담당만) : 내 월별 커미션 + 내 담당 고객 입금 내역 (환자 · 주문 정보 없음)
//   커미션 탭   (#/admin/commission, owner) : ◀ 월 ▶ · 직원별 카드(입금 건수 · 입금액 · 환불 차감 · 커미션 · 지급 상태) · 건별 상세 ·
//                                            지급 완료/취소 · CSV · "담당 미지정 입금 n건 → 지정하기" · 추적 안 되는 환불 "확인 필요"
//   Top-ups 탭  : 승인된 입금마다 "담당" 칸 · "담당 영업" 필터 · 상세의 변경 버튼(manager 이상)
//   고객 상세   : "담당 영업" 선택 (앞으로의 입금에만 적용)
//   Team 탭     : 팀원마다 "영업 담당" 스위치 · 커미션 설정(입금액의 % / 충전 크레딧 1개당 THB · 값 · 적용 시작일 → 요율 이력)

Object.assign(PageAdmin, {

  sales: { year: null, month: null, payments: null, comm: null, error: false },
  commission: { year: null, month: null, data: null, error: false, missing: false },   // missing: 015 · 016 실행 전

  // ================================================================
  // 공통: 영업 담당 목록 (staff 이상)
  // ================================================================
  loadReps: async function () {
    if (!cncHasRole('staff')) return;
    var had = !!this.reps;
    try {
      this.reps = await cncAdminListSalesReps(true);   // 015 전이면 null
    } catch (err) {
      console.warn('sales reps', err);
      this.reps = null;
    }
    // 처음 받아 왔으면 Top-ups 목록에 "담당" 칸 · 필터를 그려요
    if (!had && this.reps && this.tab === 'topups' && !document.getElementById('admin-topup-rep')) {
      this.drawBody();
      this.drawTopupsList();
    }
    if (this.topupDetail) this.drawTopupDetail();
  },

  // 담당 이름 (없으면 회색 "담당 없음")
  repNameHtml: function (id) {
    if (!id) return '<span class="muted rep-none">' + escHtml(t('rep_none')) + '</span>';
    var name = cncRepName(this.reps, id);
    return '<span class="rep-name">' + escHtml(name || String(id).slice(0, 8)) + '</span>';
  },

  // ================================================================
  // Top-ups 탭: 담당 영업 필터 · 승인한 달 칩 · 담당 변경
  // ================================================================
  // 016 실행 전이면 충전 줄에 sales_rep_id 칸이 없어요 → 필터를 숨겨요
  topupsHaveRep: function () {
    var rows = this.topups.rows || [];
    return !rows.length || ('sales_rep_id' in rows[0]);
  },

  topupRepFilterHtml: function () {
    if (!this.reps || !this.topupsHaveRep()) return '';
    var tp = this.topups;
    var opts = [{ v: 'all', label: t('rep_filter_all') }, { v: 'none', label: t('rep_filter_none') }]
      .concat(this.reps.map(function (r) { return { v: r.rep_id, label: (r.name || r.email) + (r.active ? '' : ' (' + t('rep_inactive') + ')') }; }));
    return '<div class="field">' +
      '<label class="field-label" for="admin-topup-rep">' + escHtml(t('rep_filter')) + '</label>' +
      '<select class="input" id="admin-topup-rep" onchange="PageAdmin.setTopupRepFilter(this.value)">' + opts.map(function (x) {
        return '<option value="' + escHtml(x.v) + '"' + (x.v === tp.rep ? ' selected' : '') + '>' + escHtml(x.label) + '</option>';
      }).join('') + '</select></div>';
  },

  setTopupRepFilter: function (value) {
    this.topups.rep = value;
    this.loadTopups(false);
  },

  // "승인한 달" 칩 (커미션 탭의 담당 미지정 → 지정하기에서 켜져요) — ✕ 로 끄기
  topupMonthChipHtml: function () {
    var s = this.topups.month;
    if (!s) return '';
    return '<p class="filter-chip-row"><span class="filter-chip">💳 ' + escHtml(tf('rep_approved_in', { month: s.label })) +
      ' <button type="button" class="link-btn" onclick="PageAdmin.clearTopupMonth()" aria-label="' + escHtml(t('rep_clear_filter')) + '">✕</button></span></p>';
  },

  clearTopupMonth: function () {
    this.topups.month = null;
    this.drawBody();
    this.loadTopups(false);
  },

  // 입금 담당 변경 (manager 이상) — 이미 담당이 있으면 사유 필수, 지급 완료된 달이면 COMMISSION_LOCKED
  openSetTopupRep: function () {
    var self = this;
    var st = this.topupDetail;
    var r = st && st.row;
    if (!r || !this.reps) return;
    var active = cncActiveReps(this.reps);
    var modal = uiModal({
      title: t('rep_change') + ' · ' + r.id,
      body: '<div class="review-row"><span class="review-label">' + escHtml(t('rep_now')) + '</span><span class="review-value">' + this.repNameHtml(r.sales_rep_id) + '</span></div>' +
        '<div class="field"><label class="field-label" for="tr-rep">' + escHtml(t('rep_new')) + '</label>' +
          '<select class="input" id="tr-rep"><option value="">' + escHtml(t('rep_none')) + '</option>' +
            active.map(function (x) {
              return '<option value="' + escHtml(x.rep_id) + '"' + (x.rep_id === r.sales_rep_id ? ' selected' : '') + '>' + escHtml(x.name || x.email) + '</option>';
            }).join('') + '</select>' +
          '<div class="err-slot" data-tr-err="rep"></div></div>' +
        '<div class="field"><label class="field-label" for="tr-reason">' + escHtml(t('camp_reason')) +
          (r.sales_rep_id ? ' <span class="required">*</span>' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
          '<textarea class="input textarea" id="tr-reason" rows="2" maxlength="300"></textarea>' +
          '<div class="err-slot" data-tr-err="reason"></div></div>' +
        '<p class="field-help">' + escHtml(t('rep_change_help')) + '</p>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('pe_save'), kind: 'primary', onClick: async function (close, btn) {
          var rep = modal.el.querySelector('#tr-rep').value || null;
          var reason = modal.el.querySelector('#tr-reason').value.trim();
          var errs = {};
          if ((rep || null) === (r.sales_rep_id || null)) errs.rep = 'rep_err_same';
          if (r.sales_rep_id && !reason) errs.reason = 'admin_free_err_reason';
          ['rep', 'reason'].forEach(function (k) { modal.el.querySelector('[data-tr-err="' + k + '"]').innerHTML = uiFieldError(errs[k]); });
          if (Object.keys(errs).length) return;
          btn.disabled = true;
          try {
            await cncAdminSetTopupRep(r.id, rep, reason);
            r.sales_rep_id = rep;
            close();
            uiToast(t('rep_changed_toast'), 'success');
            self.drawTopupDetail();
            if (self.tab === 'topups') self.loadTopups(false);
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            if (cncErrorCode(err) === 'COMMISSION_LOCKED') modal.el.querySelector('[data-tr-err="rep"]').innerHTML = uiFieldError('rep_err_locked');
            else uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // ================================================================
  // 고객 상세: 담당 영업 (manager 이상) — 앞으로의 입금에만 적용
  // ================================================================
  customerRepHtml: function (st) {
    if (!this.reps || !cncHasRole('manager') || !st.profile || !('sales_rep_id' in st.profile)) return '';
    var cur = st.profile.sales_rep_id || '';
    var active = cncActiveReps(this.reps);
    var dis = st.busy ? ' disabled' : '';
    return '<section class="card customer-rep-box" id="customer-rep-box">' +
      '<h3 class="detail-title">👤 ' + escHtml(t('rep_customer_title')) + '</h3>' +
      '<p class="field-help">' + escHtml(t('rep_customer_help')) + '</p>' +
      '<div class="field"><label class="field-label" for="cust-rep">' + escHtml(t('rep_label')) + '</label>' +
        '<select class="input" id="cust-rep"' + dis + '><option value="">' + escHtml(t('rep_none')) + '</option>' +
          active.map(function (r) {
            return '<option value="' + escHtml(r.rep_id) + '"' + (r.rep_id === cur ? ' selected' : '') + '>' + escHtml(r.name || r.email) + '</option>';
          }).join('') +
          // 꺼진 담당자가 지금 담당이면 그대로 보이게
          (cur && !active.some(function (r) { return r.rep_id === cur; })
            ? '<option value="' + escHtml(cur) + '" selected>' + escHtml((cncRepName(this.reps, cur) || cur.slice(0, 8)) + ' (' + t('rep_inactive') + ')') + '</option>' : '') +
        '</select></div>' +
      '<button type="button" class="btn btn-primary" onclick="PageAdmin.saveCustomerRep()"' + dis + '>' + escHtml(t('rep_save')) + '</button>' +
      '</section>';
  },

  saveCustomerRep: async function () {
    var st = this.customer;
    if (!st || st.busy || !st.profile) return;
    var sel = document.getElementById('cust-rep');
    var rep = sel ? (sel.value || null) : null;
    var cur = st.profile.sales_rep_id || null;
    if (rep === cur) { uiToast(t('rep_err_same'), 'error'); return; }
    var ok = await uiConfirm({
      title: t('rep_customer_title'),
      message: tf('rep_customer_confirm', { name: st.user.clinic_name || st.user.email || '', rep: rep ? cncRepName(this.reps, rep) : t('rep_none') })
    });
    if (!ok) return;
    st.busy = true;
    this.drawCustomer();
    try {
      await cncAdminSetCustomerRep(st.user.id, rep);
      st.profile.sales_rep_id = rep;
      uiToast(t('rep_customer_saved'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    st.busy = false;
    this.drawCustomer();
  },

  // ================================================================
  // Team 탭: 영업 담당 스위치 · 커미션 설정 (owner)
  // ================================================================
  teamSalesCellHtml: function (m) {
    var reps = this.team.reps || [];
    var rep = reps.filter(function (r) { return r.rep_id === m.user_id; })[0] || null;
    var on = !!(rep && rep.active);
    var id = 'sr-' + m.user_id;
    return '<label class="checkbox switch-row" for="' + escHtml(id) + '">' +
        '<input type="checkbox" id="' + escHtml(id) + '"' + (on ? ' checked' : '') + (m.role === 'sales' ? ' disabled' : '') +
          ' onchange="PageAdmin.toggleSalesRep(\'' + escHtml(m.user_id) + '\', this)"> ' +
        '<span>' + escHtml(t('sales_rep_switch')) + '</span></label>' +
      (m.role === 'sales' ? '<p class="field-help">' + escHtml(t('sales_rep_always')) + '</p>' : '') +
      (on ? '<p class="team-rate"><span class="muted">' + escHtml(t('rate_now')) + '</span> ' + escHtml(cncRateText(rep.rate)) + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.openRateModal(\'' + escHtml(m.user_id) + '\')">' + escHtml(t('rate_settings')) + '</button>' : '');
  },

  toggleSalesRep: async function (userId, box) {
    var m = this.memberById(userId);
    if (!m) return;
    var on = box.checked;
    box.disabled = true;
    try {
      await cncAdminSetSalesRep(userId, on);
      uiToast(t(on ? 'sales_rep_on_toast' : 'sales_rep_off_toast'), 'success');
      if (APP.user && userId === APP.user.id) { await this.reloadMyRole(); return; }
      this.loadTeam();
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
      box.checked = !on;
      box.disabled = false;
    }
  },

  // 커미션 설정 창: 방식(입금액의 % / 충전 크레딧 1개당 THB) · 값 · 적용 시작일 → 저장, 아래에 요율 이력
  openRateModal: function (userId) {
    var self = this;
    var m = this.memberById(userId);
    if (!m) return;
    var today = cncBangkokToday();
    var modal = uiModal({
      title: t('rate_settings') + ' · ' + (m.display_name || m.email),
      wide: true,
      body: '<div class="form-grid two">' +
          '<div class="field"><span class="field-label">' + escHtml(t('rate_type')) + '</span>' +
            '<label class="checkbox"><input type="radio" name="rate-type" value="percent" checked> <span>' + escHtml(t('rate_type_percent')) + '</span></label>' +
            '<label class="checkbox"><input type="radio" name="rate-type" value="per_credit"> <span>' + escHtml(t('rate_type_per_credit')) + '</span></label>' +
            '<div class="err-slot" data-rt-err="type"></div></div>' +
          '<div class="field"><label class="field-label" for="rate-value">' + escHtml(t('rate_value')) + ' <span class="required">*</span></label>' +
            '<input class="input mono" id="rate-value" type="text" inputmode="decimal" maxlength="12" placeholder="10">' +
            '<p class="field-help" id="rate-value-help">' + escHtml(t('rate_value_help_percent')) + '</p>' +
            '<div class="err-slot" data-rt-err="value"></div></div>' +
          '<div class="field"><span class="field-label">' + escHtml(t('rate_effective_from')) + '</span>' +
            uiDateField({ id: 'rate-from', value: today }) +
            '<p class="field-help">' + escHtml(t('rate_effective_help')) + '</p></div>' +
        '</div>' +
        '<h3 class="detail-title">' + escHtml(t('rate_history')) + '</h3>' +
        '<div id="rate-history">' + uiLoading() + '</div>',
      actions: [
        { label: t('btn_close'), kind: 'outline' },
        { label: t('rate_save'), kind: 'primary', onClick: async function (close, btn) {
          var typeEl = modal.el.querySelector('input[name="rate-type"]:checked');
          var type = typeEl ? typeEl.value : '';
          var value = modal.el.querySelector('#rate-value').value.trim().replace(/,/g, '');
          var from = uiDateValue('rate-from') || today;
          var err = cncValidateRate(type, value);
          modal.el.querySelector('[data-rt-err="type"]').innerHTML = err === 'rate_err_type' ? uiFieldError(err) : '';
          modal.el.querySelector('[data-rt-err="value"]').innerHTML = err && err !== 'rate_err_type' ? uiFieldError(err) : '';
          if (err) return;
          var ok = await uiConfirm({ title: t('rate_settings'), message: tf('rate_confirm', {
            name: m.display_name || m.email, rate: cncRateText({ type: type, value: Number(value) }), date: formatDate(from) }) });
          if (!ok) return;
          btn.disabled = true;
          try {
            await cncAdminSetRepRate(userId, type, value, from);
            uiToast(t('rate_saved'), 'success');
            modal.el.querySelector('#rate-value').value = '';
            btn.disabled = false;
            self.drawRateHistory(modal, userId);
            self.loadTeam();
          } catch (e2) {
            console.error(e2);
            btn.disabled = false;
            uiToast(uiErrorMessage(e2), 'error');
          }
        } }
      ]
    });
    // 방식에 따라 안내 글자 바꾸기
    modal.el.querySelectorAll('input[name="rate-type"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var help = modal.el.querySelector('#rate-value-help');
        if (help) help.textContent = t(r.value === 'percent' ? 'rate_value_help_percent' : 'rate_value_help_per_credit');
      });
    });
    this.drawRateHistory(modal, userId);
  },

  drawRateHistory: async function (modal, userId) {
    var box = modal.el.querySelector('#rate-history');
    if (!box) return;
    try {
      var rows = await cncAdminRepRates(userId);
      if (!rows.length) { box.innerHTML = '<p class="muted">' + escHtml(t('rate_history_empty')) + '</p>'; return; }
      var today = cncBangkokToday();
      // 지금 적용 중인 요율 = 시작일이 오늘 이전 중 가장 최근 (같은 날이면 나중에 넣은 것)
      var current = rows.filter(function (r) { return String(r.effective_from) <= today; })[0];
      box.innerHTML = '<div class="table-wrap"><table class="table rate-table"><thead><tr>' +
        '<th>' + escHtml(t('rate_effective_from')) + '</th><th>' + escHtml(t('rate_type')) + '</th><th>' + escHtml(t('rate_value')) + '</th><th>' + escHtml(t('rate_added')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          var state = r === current ? '<span class="badge badge-green">' + escHtml(t('rate_current')) + '</span>'
            : (String(r.effective_from) > today ? '<span class="badge">' + escHtml(t('rate_upcoming')) + '</span>' : '<span class="muted">' + escHtml(t('rate_past')) + '</span>');
          return '<tr><td class="nowrap">' + escHtml(formatDate(r.effective_from)) + '</td>' +
            '<td>' + escHtml(t(cncRateTypeKey(r.type))) + '</td>' +
            '<td class="nowrap">' + (r.type === 'percent' ? '<span class="mono">' + escHtml(formatNumber(Number(r.value))) + '</span>%' : '<span class="mono">' + escHtml(formatTHB(r.value)) + '</span>') + '</td>' +
            '<td class="nowrap">' + escHtml(formatDateTime(r.created_at)) + '</td><td>' + state + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (err) {
      console.error(err);
      box.innerHTML = '<p class="error-text">' + escHtml(uiErrorMessage(err)) + '</p>';
    }
  },

  // ================================================================
  // 월 이동 (영업 · 커미션 탭 공통) — month 는 1~12, 방콕 기준
  // ================================================================
  ensureSalesMonth: function (st) {
    if (st.year == null) {
      var now = cncBkkYearMonth();
      // 커미션 탭은 정산하는 지난달부터, 영업 탭은 이번 달부터
      var start = st === this.commission ? cncShiftMonth(now.year, now.month, -1) : now;
      st.year = start.year;
      st.month = start.month;
    }
  },

  salesMonthNavHtml: function (st, fn) {
    var now = cncBkkYearMonth();
    var isNow = st.year === now.year && st.month === now.month;
    return '<div class="month-nav">' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.' + fn + '(-1)" aria-label="' + escHtml(t('date_prev_month')) + '"><span class="arrow" aria-hidden="true">◀</span> ' + escHtml(t('admin_prev')) + '</button>' +
      '<h2 class="month-title">' + escHtml(this.monthLabel(st.year, st.month - 1)) + '</h2>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.' + fn + '(1)"' + (isNow ? ' disabled' : '') + ' aria-label="' + escHtml(t('date_next_month')) + '">' + escHtml(t('admin_next')) + ' <span class="arrow" aria-hidden="true">▶</span></button>' +
      '</div>';
  },

  // 숫자 카드 4개: 입금 건수 · 입금액(VAT 제외) · 환불 차감 · 커미션
  commissionStatsHtml: function (r) {
    function stat(key, value, cls) {
      return '<div class="card admin-stat' + (cls ? ' ' + cls : '') + '"><span class="admin-stat-label">' + escHtml(t(key)) + '</span><span class="admin-stat-num mono">' + value + '</span></div>';
    }
    return '<div class="comm-stats">' +
      stat('comm_payments', escHtml(formatNumber(r.payments)) +
        ' <span class="comm-sub">' + escHtml(tf('comm_credits_fmt', { n: formatNumber(r.credits) })) + '</span>') +
      stat('comm_amount', escHtml(formatTHB(r.amount))) +
      stat('comm_refund_deduction', (r.refundDeduction > 0 ? '−' : '') + escHtml(formatTHB(r.refundDeduction)) +
        (r.refunds ? ' <span class="comm-sub">' + escHtml(tf('comm_refunds_fmt', { n: formatNumber(r.refunds) })) + '</span>' : ''), r.refundDeduction > 0 ? 'comm-minus' : '') +
      stat('comm_commission', '<b>' + escHtml(formatTHB(r.commission)) + '</b>') +
      '</div>';
  },

  // 지급 상태 배지
  paidBadgeHtml: function (r) {
    if (r.paid) return '<span class="badge badge-green comm-paid">✓ ' + escHtml(t('comm_paid')) + ' · ' + escHtml(formatDate(r.paid.paidAt)) + '</span>';
    return '<span class="badge comm-unpaid">' + escHtml(t('comm_unpaid')) + '</span>';
  },

  // 건별 상세 표: 승인일(환불은 환불일) · 고객 · 요청번호 · 패키지 · 금액(VAT 제외) · 적용 요율 · 커미션
  commissionItemsHtml: function (items) {
    if (!items.length) return '<p class="muted">' + escHtml(t('comm_no_payments')) + '</p>';
    return '<div class="table-wrap"><table class="table comm-table"><thead><tr>' +
      '<th>' + escHtml(t('comm_date')) + '</th><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('topup_request_no')) + '</th>' +
      '<th>' + escHtml(t('topup_package')) + '</th><th>' + escHtml(t('comm_amount')) + '</th>' +
      '<th>' + escHtml(t('rate_label')) + '</th><th>' + escHtml(t('comm_commission')) + '</th></tr></thead><tbody>' +
      items.map(function (i) {
        var refund = i.kind === 'refund';
        var legacy = i.kind === 'order';
        return '<tr class="' + (refund ? 'comm-refund-row' : '') + '">' +
          '<td class="nowrap">' + escHtml(formatDate(i.date)) +
            (refund ? ' <span class="badge comm-refund-badge">' + escHtml(t('comm_refund')) + '</span>' : '') +
            (legacy ? ' <span class="badge">' + escHtml(t('comm_legacy_item')) + '</span>' : '') + '</td>' +
          '<td>' + escHtml(i.customer) + '</td>' +
          '<td class="mono nowrap">' + escHtml(i.topupId) + '</td>' +
          '<td class="nowrap"><span class="mono">' + escHtml(formatNumber(refund ? -i.credits : i.credits)) + '</span> ' + escHtml(t('credit_unit')) + '</td>' +
          '<td class="mono nowrap">' + (refund ? '−' : '') + escHtml(formatTHB(i.amount)) + '</td>' +
          '<td class="nowrap">' + (i.rateType ? escHtml(cncRateText({ type: i.rateType, value: i.rateValue })) : '<span class="muted">' + escHtml(t('rate_none')) + '</span>') + '</td>' +
          '<td class="mono nowrap"><b>' + escHtml(formatTHB(i.commission)) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  // ================================================================
  // 영업 탭 (#/admin/sales) — 영업 담당 본인
  // ================================================================
  loadSales: async function () {
    var st = this.sales;
    this.ensureSalesMonth(st);
    var token = ++this.loadToken;
    st.error = false;
    st.comm = null;
    this.drawBody();
    try {
      var res = await Promise.all([
        st.payments ? Promise.resolve(st.payments) : cncSalesMyPayments(),
        cncMyCommissionMonth(st.year, st.month)
      ]);
      if (token !== this.loadToken) return;
      st.payments = res[0];
      st.comm = res[1];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawBody();
  },

  shiftSalesMonth: function (delta) {
    var st = this.sales;
    var n = cncShiftMonth(st.year, st.month, delta);
    var now = cncBkkYearMonth();
    if (n.year * 12 + n.month > now.year * 12 + now.month) return;
    st.year = n.year;
    st.month = n.month;
    this.loadSales();
  },

  salesHtml: function () {
    var st = this.sales;
    if (st.error) { st.payments = null; return this.errorBox('PageAdmin.loadSales()', st.error); }
    var html = '<div class="admin-sales">';

    // 내 월별 커미션
    html += '<section class="card"><h2 class="card-title">💰 ' + escHtml(t('sales_my_commission')) + '</h2>' +
      this.salesMonthNavHtml(st, 'shiftSalesMonth');
    var r = st.comm && st.comm.reps[0];
    if (!st.comm) html += uiLoading();
    else if (!r) html += '<p class="muted">' + escHtml(t('comm_no_payments')) + '</p>';
    else {
      html += '<p class="comm-head-line">' + this.paidBadgeHtml(r) +
        ' <span class="muted">' + escHtml(t('rate_now')) + '</span> ' + escHtml(cncRateText(r.rate)) + '</p>' +
        this.commissionStatsHtml(r) +
        (r.paid && r.paid.note ? '<p class="field-help">' + escHtml(t('comm_note')) + ': ' + escHtml(r.paid.note) + '</p>' : '') +
        (!r.paid && !st.comm.monthEnded ? '<p class="field-help">' + escHtml(t('comm_month_running')) + '</p>' : '') +
        '<details class="comm-details"' + (r.items.length ? ' open' : '') + '><summary>' + escHtml(tf('comm_details_n', { n: r.items.length })) + '</summary>' +
          this.commissionItemsHtml(r.items) + '</details>';
    }
    html += '<p class="field-help">' + escHtml(t('comm_rule_help')) + '</p></section>';

    // 내 담당 고객 입금 내역 (환자 · 주문 정보 없음)
    html += '<section class="card"><h2 class="card-title">💳 ' + escHtml(t('sales_my_payments')) + '</h2>' +
      '<p class="field-help">' + escHtml(t('sales_my_payments_help')) + '</p>';
    if (!st.payments) html += uiLoading();
    else if (!st.payments.length) html += '<p class="muted">' + escHtml(t('comm_no_payments')) + '</p>';
    else {
      html += '<div class="table-wrap"><table class="table sales-payments-table"><thead><tr>' +
        '<th>' + escHtml(t('comm_approved_date')) + '</th><th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('topup_request_no')) + '</th>' +
        '<th>' + escHtml(t('topup_package')) + '</th><th>' + escHtml(t('comm_amount')) + '</th></tr></thead><tbody>' +
        st.payments.map(function (p) {
          return '<tr><td class="nowrap">' + escHtml(formatDate(p.approved_at)) + '</td><td>' + escHtml(p.customer || '') + '</td>' +
            '<td class="mono nowrap">' + escHtml(p.id) + '</td>' +
            '<td class="nowrap"><span class="mono">' + escHtml(formatNumber(p.credits)) + '</span> ' + escHtml(t('credit_unit')) + '</td>' +
            '<td class="mono nowrap">' + escHtml(formatTHB(p.subtotal)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section></div>';
    return html;
  },

  // ================================================================
  // 커미션 탭 (#/admin/commission) — owner
  // ================================================================
  loadCommission: async function () {
    var st = this.commission;
    this.ensureSalesMonth(st);
    var token = ++this.loadToken;
    st.error = false;
    st.missing = false;
    st.data = null;
    this.drawBody();
    try {
      var d = await cncAdminCommissionMonth(st.year, st.month);
      if (token !== this.loadToken) return;
      st.data = d;
    } catch (err) {
      if (token !== this.loadToken) return;
      // sql/015 실행 전 → 안내만 (오류 상자 대신)
      if (cncIsMissingFunction(err)) st.missing = true;
      else { console.error(err); st.error = err; }
    }
    this.drawBody();
  },

  shiftCommissionMonth: function (delta) {
    var st = this.commission;
    var n = cncShiftMonth(st.year, st.month, delta);
    var now = cncBkkYearMonth();
    if (n.year * 12 + n.month > now.year * 12 + now.month) return;
    st.year = n.year;
    st.month = n.month;
    this.loadCommission();
  },

  commissionHtml: function () {
    var st = this.commission;
    if (st.missing) return '<div class="card"><p class="notice-inline"><span aria-hidden="true">ℹ</span> ' + escHtml(t('comm_missing')) + '</p></div>';
    if (st.error) return this.errorBox('PageAdmin.loadCommission()', st.error);
    var self = this;
    var d = st.data;
    var html = '<div class="admin-commission">' +
      '<section class="card">' + this.salesMonthNavHtml(st, 'shiftCommissionMonth') +
        '<div class="comm-tools">' +
          '<p class="field-help">' + escHtml(t('comm_rule_help')) + '</p>' +
          '<button type="button" class="btn btn-outline" onclick="PageAdmin.downloadCommissionCsv()"' + (d ? '' : ' disabled') + '>⬇ ' + escHtml(t('comm_csv')) + '</button>' +
        '</div></section>';
    if (!d) return html + '<div class="card">' + uiLoading() + '</div></div>';

    // 담당 미지정 입금 경고
    if (d.unassigned > 0) {
      html += '<div class="notice-warn comm-unassigned" role="alert"><span aria-hidden="true">⚠</span> ' +
        escHtml(tf('comm_unassigned', { n: formatNumber(d.unassigned) })) +
        ' <button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.assignUnassigned()">' + escHtml(t('comm_assign_now')) + ' →</button></div>';
    }
    // 추적이 안 되는 현금 환불 → "확인 필요" (마이너스 없이)
    if (d.unresolved && d.unresolved.length) {
      html += '<div class="notice-warn comm-unresolved" role="note"><p><span aria-hidden="true">⚠</span> <b>' +
        escHtml(tf('comm_unresolved', { n: formatNumber(d.unresolved.length) })) + '</b></p>' +
        '<p class="field-help">' + escHtml(t('comm_unresolved_help')) + '</p><ul class="comm-unresolved-list">' +
        d.unresolved.map(function (u) {
          return '<li>' + escHtml(formatDate(u.date)) + ' · ' + escHtml(u.customer || '—') + ' · <span class="mono">' + escHtml(formatTHB(u.amount)) + '</span>' +
            ' · <span class="mono">' + escHtml(formatNumber(u.credits)) + '</span> ' + escHtml(t('credit_unit')) + '</li>';
        }).join('') + '</ul></div>';
    }
    if (!d.monthEnded) html += '<p class="notice-inline"><span aria-hidden="true">ℹ</span> ' + escHtml(t('comm_month_running')) + '</p>';

    if (!d.reps.length) return html + '<div class="card"><p class="empty-text">' + escHtml(t('comm_no_reps')) + '</p></div></div>';

    // 합계
    var total = d.reps.reduce(function (s, r) { return s + r.commission; }, 0);
    html += '<p class="comm-total">' + escHtml(t('comm_total')) + ' <b class="mono">' + escHtml(formatTHB(total)) + '</b></p>';

    html += d.reps.map(function (r) {
      return '<section class="card comm-rep" data-rep="' + escHtml(r.repId) + '">' +
        '<div class="card-head"><h2 class="card-title">👤 ' + escHtml(r.name) + (r.active ? '' : ' <span class="muted">(' + escHtml(t('rep_inactive')) + ')</span>') + '</h2>' +
          self.paidBadgeHtml(r) + '</div>' +
        '<p class="comm-head-line"><span class="muted">' + escHtml(t('rate_now')) + '</span> ' + escHtml(cncRateText(r.rate)) + '</p>' +
        (r.basis === 'order' ? '<p class="notice-inline">' + escHtml(t('comm_legacy_note')) + '</p>' : self.commissionStatsHtml(r)) +
        (r.basis === 'order' ? '<p class="comm-total">' + escHtml(t('comm_commission')) + ' <b class="mono">' + escHtml(formatTHB(r.commission)) + '</b></p>' : '') +
        (r.paid ? '<p class="field-help">' + escHtml(tf('comm_paid_by', { name: r.paid.by || '—', date: formatDateTime(r.paid.paidAt) })) +
          (r.paid.note ? ' · ' + escHtml(r.paid.note) : '') + ' · ' + escHtml(t('comm_snapshot_note')) + '</p>' : '') +
        '<details class="comm-details"><summary>' + escHtml(tf('comm_details_n', { n: r.items.length })) + '</summary>' +
          self.commissionItemsHtml(r.items) + '</details>' +
        '<div class="action-row">' +
          (r.paid
            ? '<button type="button" class="btn btn-outline btn-danger-text" onclick="PageAdmin.unmarkPaid(\'' + escHtml(r.repId) + '\')">' + escHtml(t('comm_unmark')) + '</button>'
            : '<button type="button" class="btn btn-primary" onclick="PageAdmin.markPaid(\'' + escHtml(r.repId) + '\')"' + (d.monthEnded ? '' : ' disabled title="' + escHtml(t('comm_month_running')) + '"') + '>✓ ' + escHtml(t('comm_mark_paid')) + '</button>') +
        '</div></section>';
    }).join('') + '</div>';
    return html;
  },

  repInMonth: function (repId) {
    var d = this.commission.data;
    return d ? d.reps.filter(function (r) { return r.repId === repId; })[0] || null : null;
  },

  // 지급 완료 (확인창 + 메모) → 이 달 숫자 잠금
  markPaid: function (repId) {
    var self = this;
    var st = this.commission;
    var r = this.repInMonth(repId);
    if (!r) return;
    var modal = uiModal({
      title: t('comm_mark_paid') + ' · ' + r.name,
      body: '<p class="modal-text">' + escHtml(tf('comm_mark_confirm', { name: r.name, month: this.monthLabel(st.year, st.month - 1), amount: formatTHB(r.commission), n: r.payments })) + '</p>' +
        '<div class="field"><label class="field-label" for="cp-note">' + escHtml(t('comm_note')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
          '<input class="input" id="cp-note" type="text" maxlength="300" placeholder="' + escHtml(t('comm_note_ph')) + '"></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('comm_mark_paid'), kind: 'primary', onClick: async function (close, btn) {
          btn.disabled = true;
          try {
            await cncAdminMarkCommissionPaid(repId, st.year, st.month, modal.el.querySelector('#cp-note').value);
            close();
            uiToast(t('comm_marked_toast'), 'success');
            self.loadCommission();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // 지급 취소 (사유 필수) → 잠금 풀림, 다시 계산
  unmarkPaid: function (repId) {
    var self = this;
    var st = this.commission;
    var r = this.repInMonth(repId);
    if (!r) return;
    var modal = uiModal({
      title: t('comm_unmark') + ' · ' + r.name,
      body: '<p class="modal-text">' + escHtml(t('comm_unmark_help')) + '</p>' +
        '<div class="field"><label class="field-label" for="cu-reason">' + escHtml(t('camp_reason')) + ' <span class="required">*</span></label>' +
          '<textarea class="input textarea" id="cu-reason" rows="2" maxlength="300"></textarea>' +
          '<div class="err-slot" data-cu-err="reason"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('comm_unmark'), kind: 'danger', onClick: async function (close, btn) {
          var reason = modal.el.querySelector('#cu-reason').value.trim();
          modal.el.querySelector('[data-cu-err="reason"]').innerHTML = reason ? '' : uiFieldError('admin_free_err_reason');
          if (!reason) return;
          btn.disabled = true;
          try {
            await cncAdminUnmarkCommissionPaid(repId, st.year, st.month, reason);
            close();
            uiToast(t('comm_unmarked_toast'), 'success');
            self.loadCommission();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // "담당 미지정 입금 n건 → 지정하기": Top-ups 탭 (승인됨 · 담당 없음 · 이 달에 승인)
  assignUnassigned: function () {
    var st = this.commission;
    var range = cncBkkMonthRange(st.year, st.month);
    this.topups.status = 'approved';
    this.topups.rep = 'none';
    this.topups.month = { from: range.from, to: range.to, label: this.monthLabel(st.year, st.month - 1) };
    this.tab = 'topups';
    history.replaceState(null, '', '#/admin/topups');
    this.drawFrame();
    this.loadTopups(false);
  },

  downloadCommissionCsv: function () {
    var st = this.commission;
    if (!st.data) return;
    var headers = [t('rep_label'), t('comm_kind'), t('topup_request_no'), t('comm_date'), t('admin_customer'), t('topup_package'),
      t('comm_amount'), t('topup_total'), t('rate_type'), t('rate_value'), t('comm_commission'), t('col_status')];
    cncDownloadText(cncCommissionCsv(st.data, headers), cncCommissionCsvName(st.year, st.month));
  }
});
