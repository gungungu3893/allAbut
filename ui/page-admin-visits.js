// ===== 관리자 Dashboard — 방문 통계 (PageAdmin 에 덧붙여요) =====
// DB: sql/013_site_analytics.sql 의 admin_visit_stats (staff 이상). 집계는 전부 DB 에서
// 위치: "현재 현황" 아래, 월별 통계 위 (.dash-section-title)
//   - 기간: 오늘 / 어제 / 최근 7일 / 최근 30일 / 이번 달 / 지난달 / 직접 선택 (uiDateField, 방콕 날짜)
//   - 카드: 방문 수(전부) · 순 방문자 · 페이지뷰 · 방문당 페이지뷰 · 신규 방문자
//   - [로봇 제외] [직원 제외] 토글 (기본 = 전부 포함) → 카드 · 그래프 · 표가 같이 바뀌어요 (광고주용 숫자)
//   - 그래프: 날짜별 방문 · 순 방문자 (하루만 고르면 0~23시), 기존 매출 그래프(.fin-chart) 모양
//   - 표: 많이 본 화면 · 들어온 곳 · 기기 · 언어 · 나라 / 전환: 기간 안 신규 가입 수 + 순 방문자 대비 %
//   - CSV (owner): 날짜별 방문 · 순 방문자 · 페이지뷰 · 로봇 · 직원
//   - 기본은 접힘: 제목 + 오늘 방문 수(get_visit_counts) + [펼치기]. 펼침 상태는 localStorage 'allabut_dash_visits_open' 에 기억

// 화면 경로 → 사람이 읽는 이름 (번역 키)
var VISIT_PATH_LABELS = {
  '/landing': 'vs_page_landing', '/signin': 'vs_page_signin', '#/': 'vs_page_landing',
  '#/home': 'nav_home', '#/new': 'nav_new', '#/orders': 'nav_orders', '#/profile': 'nav_profile', '#/topup': 'nav_topup',
  '#/guide': 'nav_guide', '#/about': 'about_nav', '#/contact': 'contact_title', '#/complete': 'complete_title',
  '#/terms': 'legal_terms', '#/privacy': 'legal_privacy', '#/credit-policy': 'legal_credit'
};

Object.assign(PageAdmin, {
  visits: { range: '7d', from: '', to: '', noBots: false, noStaff: false, data: null, error: null, missing: false, loading: false, token: 0, today: null },

  // 펼쳐 둘지 (기억한 값, 기본 접힘)
  visitsOpen: function () {
    try { return localStorage.getItem('allabut_dash_visits_open') === '1'; } catch (e) { return false; }
  },

  // 대시보드 안 자리 (내용은 drawVisits 가 채워요)
  visitsHtml: function () {
    if (!cncHasRole('staff')) return '';
    return '<section class="dash-section dash-visits" id="dash-visits">' + this.visitsSectionHtml() + '</section>';
  },

  // 머리줄(제목 · 오늘 방문 수 · 펼치기/접기) + 펼쳤으면 본문
  visitsSectionHtml: function () {
    var open = this.visitsOpen();
    var v = this.visits;
    var head = '<div class="dash-visits-head">' +
      '<h2 class="dash-section-title">' + escHtml(t('vs_title')) + '</h2>' +
      (!open && v.today != null ? '<span class="vs-today">' + escHtml(t('vs_today_label')) + ' <b class="mono">' + escHtml(formatNumber(v.today)) + '</b></span>' : '') +
      '<button type="button" class="btn btn-outline btn-sm vs-toggle" aria-expanded="' + open + '" onclick="PageAdmin.toggleVisits()">' +
        escHtml(t(open ? 'vs_collapse' : 'vs_expand')) + '</button>' +
      '</div>';
    return head + (open ? this.visitsInnerHtml(true) : '');
  },

  // 접힌 상태: 오늘 방문 수만 (랜딩 TODAY 와 같은 값)
  loadVisitsToday: async function () {
    var c = await cncGetVisitCounts();
    this.visits.today = c ? c.today : null;
    this.drawVisits();
  },

  toggleVisits: function () {
    var open = !this.visitsOpen();
    try { localStorage.setItem('allabut_dash_visits_open', open ? '1' : '0'); } catch (e) { /* 무시 */ }
    this.drawVisits();
    if (open && !this.visits.data && !this.visits.loading) this.loadVisits();
    if (!open && this.visits.today == null) this.loadVisitsToday();
  },

  // 대시보드가 열릴 때 (page-admin.js loadDash): 펼쳤으면 통계, 접혔으면 오늘 방문 수만
  loadVisitsForDash: function () {
    if (this.visitsOpen()) this.loadVisits(); else this.loadVisitsToday();
  },

  loadVisits: async function () {
    var v = this.visits;
    if (!v.from || !v.to) { var r = cncVisitRange(v.range); v.from = r.from; v.to = r.to; }
    var token = ++v.token;
    v.loading = true; v.error = null;
    this.drawVisits();
    try {
      var d = await cncAdminVisitStats(v.from, v.to, v.noBots, v.noStaff);
      if (token !== v.token) return;
      v.missing = d === null;
      v.data = d;
    } catch (err) {
      console.error(err);
      if (token !== v.token) return;
      v.error = err;
    }
    v.loading = false;
    this.drawVisits();
  },

  drawVisits: function () {
    var box = document.getElementById('dash-visits');
    if (box) box.innerHTML = this.visitsSectionHtml();
  },

  setVisitRange: function (key) {
    var v = this.visits;
    v.range = key;
    if (key !== 'custom') { var r = cncVisitRange(key); v.from = r.from; v.to = r.to; this.loadVisits(); }
    else this.drawVisits();
  },

  applyVisitCustom: function () {
    var v = this.visits;
    var f = uiDateValue('vs-from'), t2 = uiDateValue('vs-to');
    var slot = document.querySelector('#dash-visits [data-vs-err]');
    if (!f || !t2 || t2 < f) { if (slot) slot.innerHTML = uiFieldError('vs_err_range'); return; }
    v.from = f; v.to = t2;
    this.loadVisits();
  },

  toggleVisitFilter: function (k) {
    var v = this.visits;
    if (k === 'bots') v.noBots = !v.noBots; else v.noStaff = !v.noStaff;
    this.loadVisits();
  },

  visitPathLabel: function (p) {
    var key = VISIT_PATH_LABELS[p];
    if (key) return t(key);
    var m = /^#\/admin(?:\/([a-z-]+))?/.exec(p);
    if (m) { var tab = m[1] ? t('admin_tab_' + m[1]) : ''; return t('nav_admin') + (tab && tab.indexOf('admin_tab_') !== 0 ? ' · ' + tab : ''); }
    return p || '—';
  },

  // noTitle: 머리줄(visitsSectionHtml)에 이미 제목이 있을 때
  visitsInnerHtml: function (noTitle) {
    var self = this;
    var v = this.visits;
    var html = noTitle ? '' : '<h2 class="dash-section-title">' + escHtml(t('vs_title')) + '</h2>';
    if (v.missing) return html + '<p class="muted">' + escHtml(t('vs_missing')) + '</p>';

    // 기간 · 필터
    var ranges = ['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'custom'];
    html += '<div class="vs-controls">' +
      '<div class="vs-ranges" role="group" aria-label="' + escHtml(t('vs_period')) + '">' + ranges.map(function (k) {
        return '<button type="button" class="chip vs-range' + (v.range === k ? ' active' : '') + '" aria-pressed="' + (v.range === k) + '" onclick="PageAdmin.setVisitRange(\'' + k + '\')">' + escHtml(t('vs_range_' + k)) + '</button>';
      }).join('') + '</div>' +
      '<div class="vs-filters">' +
        '<label class="checkbox"><input type="checkbox" id="vs-no-bots"' + (v.noBots ? ' checked' : '') + ' onchange="PageAdmin.toggleVisitFilter(\'bots\')"> <span>' + escHtml(t('vs_no_bots')) + '</span></label>' +
        '<label class="checkbox"><input type="checkbox" id="vs-no-staff"' + (v.noStaff ? ' checked' : '') + ' onchange="PageAdmin.toggleVisitFilter(\'staff\')"> <span>' + escHtml(t('vs_no_staff')) + '</span></label>' +
      '</div></div>';
    if (v.range === 'custom') {
      html += '<div class="vs-custom form-grid two">' +
        '<div class="field"><span class="field-label">' + escHtml(t('vs_from')) + '</span>' + uiDateField({ id: 'vs-from', value: v.from }) + '</div>' +
        '<div class="field"><span class="field-label">' + escHtml(t('vs_to')) + '</span>' + uiDateField({ id: 'vs-to', value: v.to }) + '</div>' +
        '<div class="span-2"><div class="err-slot" data-vs-err></div><button type="button" class="btn btn-outline" onclick="PageAdmin.applyVisitCustom()">' + escHtml(t('vs_apply')) + '</button></div>' +
      '</div>';
    }
    html += '<p class="muted vs-period-line">' + escHtml(formatDate(v.from)) + (v.to !== v.from ? ' – ' + escHtml(formatDate(v.to)) : '') +
      (v.noBots || v.noStaff ? ' · ' + escHtml(t('vs_filtered')) : ' · ' + escHtml(t('vs_all_included'))) + '</p>';

    if (v.error) return html + '<p class="error-text"><span aria-hidden="true">⚠</span> ' + escHtml(uiErrorMessage(v.error)) + '</p>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadVisits()">' + escHtml(t('btn_retry')) + '</button>';
    if (!v.data) return html + uiLoading();

    var d = v.data, s = d.summary;
    var ppv = s.visits ? (s.pageviews / s.visits) : 0;
    function card(labelKey, value, cls) {
      return '<div class="admin-stat vs-card ' + (cls || '') + '"><span class="admin-stat-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="admin-stat-value mono">' + value + '</span></div>';
    }
    html += '<div class="vs-cards' + (v.loading ? ' is-loading' : '') + '">' +
      card('vs_visits', formatNumber(s.visits), 'vs-card-visits') +
      card('vs_visitors', formatNumber(s.visitors), 'vs-card-visitors') +
      card('vs_pageviews', formatNumber(s.pageviews), 'vs-card-pageviews') +
      card('vs_ppv', ppv.toFixed(1), 'vs-card-ppv') +
      card('vs_new_visitors', formatNumber(s.newVisitors), 'vs-card-new') +
      '</div>';
    if (!v.noBots || !v.noStaff) {
      html += '<p class="muted vs-kinds">🤖 ' + escHtml(tf('vs_bot_visits', { n: formatNumber(s.botVisits) })) + ' · 🧑‍💼 ' + escHtml(tf('vs_staff_visits', { n: formatNumber(s.staffVisits) })) + '</p>';
    }

    // 전환
    var conv = s.visitors ? (d.signups / s.visitors * 100) : 0;
    html += '<p class="vs-conversion"><span aria-hidden="true">📝</span> ' + escHtml(tf('vs_signups', { n: formatNumber(d.signups) })) +
      ' · <b class="mono">' + conv.toFixed(1) + '%</b> ' + escHtml(t('vs_conv_note')) + '</p>';

    // 그래프
    html += this.visitsChartHtml(d);

    // 표
    function table(titleKey, rows, labelFn, cls) {
      var total = rows.reduce(function (a, r) { return a + (Number(r.n) || 0); }, 0) || 1;
      return '<section class="card vs-table ' + (cls || '') + '"><h3 class="card-title">' + escHtml(t(titleKey)) + '</h3>' +
        (rows.length
          ? '<table class="table"><tbody>' + rows.map(function (r) {
              var n = Number(r.n) || 0;
              return '<tr><td>' + escHtml(labelFn(r.key)) + '</td><td class="mono num">' + formatNumber(n) + '</td>' +
                '<td class="mono num muted">' + Math.round(n / total * 100) + '%</td></tr>';
            }).join('') + '</tbody></table>'
          : '<p class="muted">' + escHtml(t('vs_no_data')) + '</p>') +
        '</section>';
    }
    var langName = function (k) { var l = (typeof LANGUAGES !== 'undefined' ? LANGUAGES : []).filter(function (x) { return x.code === k; })[0]; return l ? l.name : (k || t('vs_unknown')); };
    var countryName = function (k) {
      if (!k) return t('vs_unknown');
      try { return new Intl.DisplayNames([localeTag()], { type: 'region' }).of(k) + ' (' + k + ')'; } catch (e) { return k; }
    };
    html += '<div class="vs-tables">' +
      table('vs_top_pages', d.paths, function (k) { return self.visitPathLabel(k); }, 'vs-paths') +
      table('vs_sources', cncReferrerGroups(d.referrers), function (k) { return t('vs_src_' + k); }, 'vs-sources') +
      table('vs_devices', d.devices, function (k) { return k ? t('vs_dev_' + k) : t('vs_unknown'); }, 'vs-devices') +
      table('vs_langs', d.langs, langName, 'vs-langs') +
      table('vs_countries', d.countries, countryName, 'vs-countries') +
      '</div>';

    if (cncHasRole('owner')) {
      html += '<div class="vs-actions"><button type="button" class="btn btn-outline" onclick="PageAdmin.downloadVisitsCsv()">⬇ ' + escHtml(t('vs_csv')) + '</button></div>';
    }
    return html;
  },

  // 막대 = 방문 수, 선 = 순 방문자 (매출 그래프와 같은 모양). 하루면 0~23시
  visitsChartHtml: function (d) {
    var hourly = d.hourly && d.from === d.to;
    var pts = hourly
      ? d.hourly.map(function (x) { return { label: String(x.hour), full: String(x.hour).padStart(2, '0') + ':00', a: x.visits, b: x.visitors }; })
      : d.daily.map(function (x) { return { label: x.day.slice(8), full: formatDate(x.day), a: x.visits, b: x.visitors }; });
    if (!pts.length) return '';
    var box = document.getElementById('admin-body');
    var W = Math.max(300, Math.min(1400, (box ? box.clientWidth : 720) - 40));
    var H = 220, padL = 8, padR = 8, padT = 24, padB = 36;
    var n = pts.length, slot = (W - padL - padR) / n;
    var barW = Math.max(3, Math.min(40, slot * 0.6));
    var max = Math.max.apply(null, pts.map(function (p) { return Math.max(p.a, p.b); }).concat([1]));
    var plotH = H - padT - padB;
    var rtl = document.documentElement.dir === 'rtl';
    function y(val) { return padT + plotH - (val / max) * plotH; }
    function cx(i) { var k = rtl ? n - 1 - i : i; return padL + slot * k + slot / 2; }
    var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(W / 44))));
    var bars = '', labels = '', line = [], dots = '';
    pts.forEach(function (p, i) {
      var bh = Math.max(p.a ? 2 : 0, padT + plotH - y(p.a));
      var tip = p.full + ' · ' + t('vs_visits') + ' ' + p.a + ' · ' + t('vs_visitors') + ' ' + p.b;
      bars += '<g><title>' + escHtml(tip) + '</title><rect class="fin-bar" x="' + (cx(i) - barW / 2).toFixed(1) + '" y="' + (padT + plotH - bh).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2"></rect></g>';
      if (i % every === 0) labels += '<text class="fin-axis" x="' + cx(i).toFixed(1) + '" y="' + (H - padB + 18) + '" text-anchor="middle">' + escHtml(p.label) + '</text>';
      line.push(cx(i).toFixed(1) + ',' + y(p.b).toFixed(1));
      if (n <= 40) dots += '<circle class="fin-dot" cx="' + cx(i).toFixed(1) + '" cy="' + y(p.b).toFixed(1) + '" r="3"></circle>';
    });
    var svg = '<svg class="fin-chart vs-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escHtml(t(hourly ? 'vs_chart_hourly' : 'vs_chart_daily')) + '">' +
      '<line class="fin-base" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + plotH) + '" y2="' + (padT + plotH) + '"></line>' +
      bars + '<polyline class="fin-line" points="' + line.join(' ') + '"></polyline>' + dots + labels + '</svg>';
    return '<section class="card vs-chart-card"><div class="card-head"><h3 class="card-title">' + escHtml(t(hourly ? 'vs_chart_hourly' : 'vs_chart_daily')) + '</h3>' +
      '<span class="legend"><span class="legend-dot fin-legend-bar"></span>' + escHtml(t('vs_visits')) +
      ' <span class="legend-line"></span>' + escHtml(t('vs_visitors')) + '</span></div>' +
      '<div class="fin-chart-wrap">' + svg + '</div></section>';
  },

  // CSV (owner) — 날짜별
  downloadVisitsCsv: function () {
    var v = this.visits;
    if (!cncHasRole('owner') || !v.data) return;
    var csv = cncVisitsCsv(v.data.daily, [t('vs_csv_date'), t('vs_visits'), t('vs_visitors'), t('vs_pageviews'), t('vs_csv_bots'), t('vs_csv_staff')]);
    cncDownloadText(csv, cncVisitsCsvName(v.from, v.to));
  }
});
