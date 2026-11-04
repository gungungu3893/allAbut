// ================================================================
// allAbut — Admin → Dashboard 의 "Revenue"(매출) 구역
// ================================================================
// page-admin.js 의 PageAdmin 에 함수를 덧붙여요 (이 파일은 page-admin.js 다음에 불러와요).
// 월 선택(◀ 월 ▶)은 주문 통계와 함께 써요: PageAdmin.dash.year / dash.month (0~11)
// DB 함수는 month 를 1~12 로 받아서 +1 해서 넘겨요. 달의 경계는 방콕 시간 기준이에요.

Object.assign(PageAdmin, {

  // 매출 상태: month(그 달), trend(최근 12개월), outstanding(지금 시점), error, missing(004 SQL 미실행)
  fin: { month: null, trend: null, outstanding: null, error: false, missing: false, exporting: false },

  // 대시보드를 처음 열 때: 그 달 + 12개월 추이 + 지금 시점 미사용 크레딧
  loadFinance: async function (token) {
    var f = this.fin;
    var d = this.dash;
    f.error = false;
    f.missing = false;
    f.month = null;
    f.trend = null;
    f.outstanding = null;
    try {
      var res = await Promise.all([
        cncAdminFinanceMonth(d.year, d.month + 1),
        cncAdminFinanceTrend(12),
        cncAdminOutstandingCredits()
      ]);
      if (token !== this.loadToken) return;
      f.month = res[0];
      f.trend = res[1];
      f.outstanding = res[2];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      f.error = err;
      f.missing = cncFinanceMissing(err);
    }
  },

  // 달만 바꿀 때: 그 달 요약만 다시 (추이·지금 시점은 그대로)
  loadFinanceMonth: async function (token) {
    var f = this.fin;
    var d = this.dash;
    f.month = null;
    f.error = false;
    try {
      var m = await cncAdminFinanceMonth(d.year, d.month + 1);
      if (token !== this.loadToken) return;
      f.month = m;
      if (!f.trend || !f.outstanding) {
        var res = await Promise.all([cncAdminFinanceTrend(12), cncAdminOutstandingCredits()]);
        if (token !== this.loadToken) return;
        f.trend = res[0];
        f.outstanding = res[1];
      }
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      f.error = err;
      f.missing = cncFinanceMissing(err);
    }
  },

  // 매출 구역만 다시 불러오기 (오류 상자의 Retry)
  retryFinance: async function () {
    var token = ++this.loadToken;
    this.fin.error = false;
    this.drawBody();
    await this.loadFinance(token);
    if (token === this.loadToken) this.drawBody();
  },

  // 카드 옆 "?" 설명
  finHelp: function (btn, key) {
    uiPopover(btn, '<p>' + escHtml(t(key)) + '</p>');
  },

  helpBtn: function (key) {
    return '<button type="button" class="fin-help" aria-label="' + escHtml(t('fin_help_label')) + '" aria-expanded="false" ' +
      'onclick="event.stopPropagation(); PageAdmin.finHelp(this, \'' + key + '\')">?</button>';
  },

  // ----------------------------------------------------------------
  // 화면
  // ----------------------------------------------------------------
  financeHtml: function () {
    var self = this;
    var f = this.fin;
    var d = this.dash;

    if (f.error) {
      if (f.missing) {
        return '<div class="card notice-card"><p><span aria-hidden="true">⚠</span> ' + escHtml(t('fin_err_missing')) + '</p>' +
          '<button type="button" class="btn btn-outline" onclick="PageAdmin.retryFinance()">' + escHtml(t('btn_retry')) + '</button></div>';
      }
      return this.errorBox('PageAdmin.retryFinance()', f.error);
    }
    var m = f.month;
    if (!m) return '<div class="card">' + uiLoading() + '</div>';
    var o = f.outstanding;

    // 큰 카드
    function big(key, help, amount, sub, cls, badge) {
      return '<div class="card fin-big ' + (cls || '') + '">' +
        '<div class="fin-card-head"><span class="admin-stat-label">' + escHtml(t(key)) + '</span>' +
          (badge ? '<span class="fin-badge">' + escHtml(badge) + '</span>' : '') + self.helpBtn(help) + '</div>' +
        '<span class="fin-amount mono">' + escHtml(formatTHB(amount)) + '</span>' +
        (sub ? '<span class="fin-sub">' + sub + '</span>' : '') +
        '</div>';
    }
    // 작은 카드 (onclick 이 있으면 버튼)
    function small(key, help, main, sub, onclick, cls) {
      var inner = '<div class="fin-card-head"><span class="admin-stat-label">' + escHtml(t(key)) + '</span>' + self.helpBtn(help) + '</div>' +
        '<span class="fin-small-num mono">' + main + '</span>' +
        (sub ? '<span class="fin-sub">' + sub + '</span>' : '') +
        (onclick ? '<span class="fin-go">' + escHtml(t('fin_open_topups')) + ' <span class="arrow" aria-hidden="true">→</span></span>' : '');
      if (onclick) {
        return '<div class="card fin-small clickable ' + (cls || '') + '" role="button" tabindex="0" onclick="' + onclick + '" ' +
          'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + onclick + '}">' + inner + '</div>';
      }
      return '<div class="card fin-small ' + (cls || '') + '">' + inner + '</div>';
    }
    function credits(n) { return escHtml(tf('fin_credits_fmt', { n: formatNumber(n) })); }

    var html = '';

    // ----- 큰 카드 4개 -----
    html += '<div class="fin-bigs">' +
      big('fin_total', 'fin_help_total', m.topups.total,
        escHtml(tf('fin_approved_fmt', { n: formatNumber(m.topups.count) })), 'fin-total') +
      big('fin_net', 'fin_help_net', m.net,
        m.refunds.amount ? escHtml(t('fin_refunds')) + ' −' + escHtml(formatTHB(m.refunds.amount)) : escHtml(t('fin_no_refunds')), 'fin-net') +
      big('fin_consumed', 'fin_help_consumed', m.consumed.value, credits(m.consumed.credits), 'fin-consumed') +
      (o
        ? big('fin_outstanding', 'fin_help_outstanding', o.paidValue,
            credits(o.paidCredits) + (o.freeCredits ? ' · ' + escHtml(tf('fin_free_fmt', { n: formatNumber(o.freeCredits) })) : '') +
            '<br>' + escHtml(t('fin_as_of')) + ' ' + escHtml(formatDateTime(o.asOf)),
            'fin-outstanding', t('fin_now'))
        : '') +
      '</div>';

    // ----- 작은 카드 -----
    var pn = m.pendingNow;
    html += '<div class="fin-smalls">' +
      small('fin_approved', 'fin_help_approved', escHtml(formatNumber(m.topups.count)), credits(m.topups.credits)) +
      small('fin_subtotal_vat', 'fin_help_subtotal_vat',
        escHtml(formatTHB(m.topups.subtotal)),
        escHtml(t('fin_vat')) + ' ' + escHtml(formatTHB(m.topups.vat))) +
      small('fin_pending', 'fin_help_pending', escHtml(formatNumber(pn.count)),
        escHtml(formatTHB(pn.total)) +
          (m.pending.count !== pn.count ? '<br>' + escHtml(tf('fin_pending_month_fmt', { n: formatNumber(m.pending.count) })) : ''),
        "PageAdmin.setTab('topups')", pn.count ? 'fin-has-pending' : '') +
      small('fin_refunds', 'fin_help_refunds', escHtml(formatTHB(m.refunds.amount)),
        escHtml(tf('fin_cases_fmt', { n: formatNumber(m.refunds.count) })) + ' · ' + credits(m.refunds.credits)) +
      small('fin_expired', 'fin_help_expired', escHtml(formatTHB(m.expired.value)), credits(m.expired.credits)) +
      small('fin_bonus', 'fin_help_bonus', escHtml(formatNumber(m.bonus.credits)), escHtml(t('credit_unit'))) +
      '</div>';

    // ----- 패키지별 판매 -----
    html += '<section class="card"><div class="card-head"><h3 class="card-title">' + escHtml(t('fin_by_package')) + '</h3></div>' +
      (m.byPackage.length
        ? '<div class="table-wrap"><table class="table admin-table-plain fin-table"><thead><tr>' +
            '<th>' + escHtml(t('fin_col_package')) + '</th><th class="num">' + escHtml(t('fin_col_count')) + '</th>' +
            '<th class="num">' + escHtml(t('fin_col_credits')) + '</th><th class="num">' + escHtml(t('fin_col_total')) + '</th></tr></thead><tbody>' +
            m.byPackage.map(function (p) {
              return '<tr><td>' + credits(p.credits) + ' <span class="muted">· ' + escHtml(formatTHB(p.unitPrice)) + '</span></td>' +
                '<td class="num mono">' + formatNumber(p.count) + '</td>' +
                '<td class="num mono">' + formatNumber(p.totalCredits) + '</td>' +
                '<td class="num mono">' + escHtml(formatTHB(p.total)) + '</td></tr>';
            }).join('') +
            '</tbody><tfoot><tr><th>' + escHtml(t('fin_sum')) + '</th>' +
              '<td class="num mono">' + formatNumber(m.topups.count) + '</td>' +
              '<td class="num mono">' + formatNumber(m.topups.credits) + '</td>' +
              '<td class="num mono"><b>' + escHtml(formatTHB(m.topups.total)) + '</b></td></tr></tfoot></table></div>'
        : '<p class="empty-text">' + escHtml(t('fin_no_topups')) + '</p>') +
      '</section>';

    // ----- 상위 고객 5명 -----
    html += '<section class="card"><div class="card-head"><h3 class="card-title">' + escHtml(t('fin_top_customers')) + '</h3></div>' +
      (m.topCustomers.length
        ? '<ol class="fin-top">' + m.topCustomers.map(function (c, i) {
            return '<li><span class="fin-rank mono">' + (i + 1) + '</span>' +
              '<span class="fin-top-name">' + escHtml(c.name || '—') +
                ' <span class="muted">· ' + escHtml(tf('fin_cases_fmt', { n: formatNumber(c.count) })) + '</span></span>' +
              '<span class="fin-top-total mono">' + escHtml(formatTHB(c.total)) + '</span></li>';
          }).join('') + '</ol>'
        : '<p class="empty-text">' + escHtml(t('fin_no_topups')) + '</p>') +
      '</section>';

    // ----- 12개월 추이 -----
    if (f.trend && f.trend.length) html += this.financeChartHtml(f.trend);

    // ----- CSV -----
    html += '<section class="card fin-export"><div>' +
        '<h3 class="card-title">' + escHtml(t('fin_export_title')) + '</h3>' +
        '<p class="muted">' + escHtml(t('fin_export_desc')) + '</p></div>' +
        '<button type="button" class="btn btn-primary" id="fin-csv-btn" onclick="PageAdmin.downloadCsv()"' + (f.exporting ? ' disabled' : '') + '>' +
          '<span aria-hidden="true">⬇</span> ' + escHtml(t('fin_download_csv')) + '</button>' +
      '</section>';

    return html;
  },

  // 막대(입금) + 선(사용 가치) SVG — 막대를 누르면 그 달로
  financeChartHtml: function (trend) {
    var self = this;
    var d = this.dash;
    // 그래프 폭 = 화면에 보이는 칸의 실제 폭 (글자가 늘어나 보이지 않게 1:1 로 그려요)
    var box = document.getElementById('admin-body');
    var W = Math.max(300, Math.min(1400, (box ? box.clientWidth : 720) - 40));
    var H = 260, padL = 8, padR = 8, padT = 28, padB = 46;
    var n = trend.length;
    var slot = (W - padL - padR) / n;
    var barW = Math.max(10, Math.min(56, slot * 0.56));
    var max = Math.max.apply(null, trend.map(function (x) { return Math.max(x.topups, x.consumed); }).concat([1]));
    var plotH = H - padT - padB;
    function y(v) { return padT + plotH - (v / max) * plotH; }
    var rtl = document.documentElement.dir === 'rtl';
    function cx(i) { var k = rtl ? n - 1 - i : i; return padL + slot * k + slot / 2; }

    var bars = '', labels = '', pts = [], dots = '';
    trend.forEach(function (x, i) {
      var sel = x.year === d.year && x.month === d.month + 1;
      var bx = cx(i) - barW / 2;
      var by = y(x.topups);
      var bh = Math.max(x.topups ? 3 : 0, padT + plotH - by);
      var label = self.monthLabel(x.year, x.month - 1) + ' · ' + t('fin_total') + ' ' + formatTHB(x.topups) +
        ' · ' + t('fin_consumed') + ' ' + formatTHB(x.consumed);
      bars += '<g class="fin-bar-g' + (sel ? ' selected' : '') + '" role="button" tabindex="0" aria-label="' + escHtml(label) + '" ' +
        'onclick="PageAdmin.setMonth(' + x.year + ', ' + (x.month - 1) + ')" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();PageAdmin.setMonth(' + x.year + ', ' + (x.month - 1) + ')}">' +
        '<title>' + escHtml(label) + '</title>' +
        '<rect class="fin-hit" x="' + (cx(i) - slot / 2).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) + '" height="' + (plotH + padB) + '"></rect>' +
        '<rect class="fin-bar" x="' + bx.toFixed(1) + '" y="' + (padT + plotH - bh).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3"></rect>' +
        '</g>';
      labels += '<text class="fin-axis' + (sel ? ' selected' : '') + '" x="' + cx(i).toFixed(1) + '" y="' + (H - padB + 20) + '" text-anchor="middle">' +
        escHtml(self.monthLabel(x.year, x.month - 1, true)) + '</text>';
      if (x.topups && slot >= 44) {
        labels += '<text class="fin-val" x="' + cx(i).toFixed(1) + '" y="' + (padT + plotH - bh - 6).toFixed(1) + '" text-anchor="middle">' +
          escHtml(self.shortTHB(x.topups)) + '</text>';
      }
      pts.push(cx(i).toFixed(1) + ',' + y(x.consumed).toFixed(1));
      dots += '<circle class="fin-dot" cx="' + cx(i).toFixed(1) + '" cy="' + y(x.consumed).toFixed(1) + '" r="4"></circle>';
    });

    var svg = '<svg class="fin-chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + escHtml(t('fin_trend_title')) + '">' +
      '<line class="fin-base" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + plotH) + '" y2="' + (padT + plotH) + '"></line>' +
      bars +
      '<polyline class="fin-line" points="' + pts.join(' ') + '"></polyline>' + dots + labels +
      '</svg>';

    return '<section class="card"><div class="card-head"><h3 class="card-title">' + escHtml(t('fin_trend_title')) + '</h3>' +
      '<span class="legend"><span class="legend-dot fin-legend-bar"></span>' + escHtml(t('fin_total')) +
      ' <span class="legend-line"></span>' + escHtml(t('fin_consumed')) + '</span></div>' +
      '<p class="muted fin-chart-hint">' + escHtml(t('fin_trend_hint')) + '</p>' +
      '<div class="fin-chart-wrap">' + svg + '</div></section>';
  },

  // 그래프 위 짧은 금액 (12.5k)
  shortTHB: function (v) {
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k';
    return String(Math.round(v));
  },

  // "Download CSV" — 그 달 승인된 충전 목록
  downloadCsv: async function () {
    var f = this.fin;
    var d = this.dash;
    if (f.exporting) return;
    f.exporting = true;
    var btn = document.getElementById('fin-csv-btn');
    if (btn) btn.disabled = true;
    try {
      var year = d.year, month = d.month + 1;
      var rows = await cncAdminTopupsExport(year, month);
      if (!rows.length) {
        uiToast(t('fin_export_empty'), 'info');
      } else {
        var headers = ['fin_csv_id', 'fin_csv_date', 'fin_csv_email', 'fin_csv_clinic', 'fin_csv_tax', 'fin_csv_package',
          'fin_csv_credits', 'fin_csv_unit', 'fin_csv_subtotal', 'fin_csv_vat', 'fin_csv_total'].map(function (k) { return t(k); });
        cncDownloadText(cncTopupsCsv(rows, headers), cncTopupsCsvName(year, month));
        uiToast(tf('fin_export_done', { n: rows.length }), 'success');
      }
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    f.exporting = false;
    btn = document.getElementById('fin-csv-btn');
    if (btn) btn.disabled = false;
  }
});
