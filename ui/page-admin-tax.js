// ===== 관리자: 🧾 세금계산서 탭 #/admin/tax (sql/021) — PageAdmin 에 덧붙여요 =====
// manager 이상이 볼 수 있어요. 보고서 · 설정은 owner 만.
// 화면 (위쪽 작은 탭):
//   1) 문서 목록   — 달 이동 ◀ ▶ · 검색(번호 / 고객 / Tax ID / 충전번호) · 종류 · 우편 상태 필터
//                   세금계산서 · 크레딧 노트 = [원본 출력] [사본 출력] [둘 다 출력] / 영수증 = [출력]
//   2) 우편 발송   — 아직 안 보낸 세금계산서 · 크레딧 노트 (모든 달). 같은 고객 + 같은 달은 한 봉투로 묶여요
//                   여러 개 선택 → [원본 한꺼번에 출력] [주소 라벨 (A4 라벨지)] [주소 (창봉투)] [발송 완료로 표시 (날짜 · 등기번호)]
//   3) 미발행 충전 — 승인됐는데 문서가 없는 충전 (설정이 꺼져 있었을 때) → [발행] (발행일 = 오늘, 원래 승인일도 문서에 나와요)
//                   판매자 설정이 안 됐으면 [발행] 비활성 + "설정을 마치면 발행할 수 있어요" (canIssueFor). 그래도 서버가 TAX_SETTINGS_MISSING /
//                   RECEIPT_SETTINGS_MISSING 을 돌려주면 무엇을 입력할지 안내 창 + [설정으로] (owner)
//   4) 보고서      — 월별 매출 세금 보고서 (세금계산서 + 크레딧 노트 마이너스) · 해외 매출 (영수증 + 환불 영수증) → 출력 · CSV  (owner)
//   5) 설정        — VAT 등록 · 판매자 태국어/영어 이름 · 주소 · Tax ID · 본사/지점 · 우편 주기 · 해외 고객 VAT  (owner)
// 실제 권한 · 검사는 DB (RLS + 함수). 발행된 문서는 서버가 못 바꾸게 막아요 (정정은 크레딧 노트 / 환불 영수증으로만).

Object.assign(PageAdmin, {
  tax: {
    view: 'list', ym: null, filter: { type: '', mail: '', q: '' },
    rows: null, error: null, ready: null,
    mail: null, mailError: null, picked: {},
    missing: null, missingError: null, issuing: null,
    report: null, reportError: null, reportYm: null,
    company: null, payment: null, settingsError: null, saving: false
  },

  TAX_VIEWS: [
    { id: 'list', key: 'tax_view_list', min: 'manager' },
    { id: 'mail', key: 'tax_view_mail', min: 'manager' },
    { id: 'missing', key: 'tax_view_missing', min: 'manager' },
    { id: 'report', key: 'tax_view_report', min: 'owner' },
    { id: 'settings', key: 'tax_view_settings', min: 'owner' }
  ],

  // ----------------------------------------------------------------
  // 불러오기
  // ----------------------------------------------------------------
  loadTax: async function () {
    var st = this.tax;
    if (!st.ym) st.ym = cncBkkThisMonth();
    if (!st.reportYm) st.reportYm = cncBkkThisMonth();
    if (!cncHasRole('owner') && (st.view === 'report' || st.view === 'settings')) st.view = 'list';
    this.drawBody();
    st.ready = await cncTaxTableReady();
    if (!st.ready) { this.drawTax(); return; }
    this.loadTaxCompany();
    if (st.view === 'list') return this.loadTaxList();
    if (st.view === 'mail') return this.loadTaxMail();
    if (st.view === 'missing') return this.loadTaxMissing();
    if (st.view === 'report') return this.loadTaxReport();
    this.drawTax();
  },

  // 회사 설정 (세금계산서 발행 준비 안내 · 설정 화면)
  loadTaxCompany: async function () {
    var st = this.tax;
    try {
      var res = await Promise.all([
        sb.from('company_settings').select('*').eq('id', 1).maybeSingle(),
        sb.from('payment_settings').select('*').eq('id', 1).maybeSingle()
      ]);
      st.company = res[0].data || {};
      st.payment = res[1].data || {};
      st.settingsError = null;
    } catch (err) {
      st.settingsError = err;
    }
    this.drawTax();
  },

  loadTaxList: async function () {
    var st = this.tax;
    var token = ++this.loadToken;
    st.rows = null;
    st.error = null;
    this.drawTax();
    try {
      var rows = await cncAdminListTaxDocs(st.ym, st.filter);
      if (token !== this.loadToken) return;
      st.rows = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.drawTax();
  },

  loadTaxMail: async function () {
    var st = this.tax;
    st.mail = null;
    st.mailError = null;
    st.picked = {};
    this.drawTax();
    try {
      st.mail = await cncAdminPendingMail();
    } catch (err) {
      st.mailError = err;
    }
    this.drawTax();
  },

  loadTaxMissing: async function () {
    var st = this.tax;
    st.missing = null;
    st.missingError = null;
    this.drawTax();
    try {
      st.missing = await cncAdminTopupsWithoutDocs();
    } catch (err) {
      st.missingError = err;
    }
    this.drawTax();
  },

  loadTaxReport: async function () {
    var st = this.tax;
    st.report = null;
    st.reportError = null;
    this.drawTax();
    try {
      st.report = await cncAdminTaxReport(st.reportYm);
    } catch (err) {
      st.reportError = err;
    }
    this.drawTax();
  },

  setTaxView: function (id) {
    this.tax.view = id;
    this.loadTax();
  },

  // 대시보드 "우편 발송 대기" 카드 → 세금계산서 탭의 우편 발송 화면
  openMailQueue: function () {
    this.tax.view = 'mail';
    this.tab = 'tax';
    history.replaceState(null, '', '#/admin/tax');
    this.drawFrame();
    this.loadTax();
  },

  // ----------------------------------------------------------------
  // 그리기
  // ----------------------------------------------------------------
  taxHtml: function () {
    return '<div id="admin-tax"></div>';
  },

  drawTax: function () {
    var box = document.getElementById('admin-tax');
    if (!box) return;
    var st = this.tax;
    if (st.ready === false) {
      box.innerHTML = '<div class="card"><p class="empty-text"><span aria-hidden="true">ℹ</span> ' + escHtml(t('tax_missing_sql')) + '</p></div>';
      return;
    }
    var views = this.TAX_VIEWS.filter(function (v) { return cncHasRole(v.min); });
    var html = '<div class="seg tax-views" role="tablist">' + views.map(function (v) {
      var on = st.view === v.id;
      return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageAdmin.setTaxView(\'' + v.id + '\')">' + escHtml(t(v.key)) + '</button>';
    }).join('') + '</div>';
    html += this.taxReadyNoticeHtml();
    if (st.view === 'mail') html += this.taxMailHtml();
    else if (st.view === 'missing') html += this.taxMissingHtml();
    else if (st.view === 'report') html += this.taxReportHtml();
    else if (st.view === 'settings') html += this.taxSettingsHtml();
    else html += this.taxListHtml();
    box.innerHTML = html;
  },

  // VAT 등록 정보가 없으면 안내 (세금계산서가 발행되지 않아요)
  taxReadyNoticeHtml: function () {
    var c = this.tax.company;
    if (!c) return '';
    var out = '';
    if (!cncTaxInvoiceReady(c)) {
      out += '<div class="notice notice-warn" role="status"><p><span aria-hidden="true">⚠</span> ' + escHtml(t('tax_not_ready')) +
        (cncHasRole('owner') ? ' <button type="button" class="link-btn" onclick="PageAdmin.setTaxView(\'settings\')">' + escHtml(t('tax_view_settings')) + ' →</button>' : '') + '</p></div>';
    }
    if (!cncReceiptReady(c)) {
      out += '<div class="notice notice-warn" role="status"><p><span aria-hidden="true">⚠</span> ' + escHtml(t('tax_receipt_not_ready')) +
        (cncHasRole('owner') ? ' <button type="button" class="link-btn" onclick="PageAdmin.setTaxView(\'settings\')">' + escHtml(t('tax_view_settings')) + ' →</button>' : '') + '</p></div>';
    }
    return out;
  },

  taxMonthNavHtml: function (ym, fn) {
    return '<div class="docs-month">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="' + fn + '(-1)">◀ ' + escHtml(t('tax_prev_month')) + '</button>' +
      '<b class="docs-month-label">' + escHtml(cncMonthLabel(ym, currentLang)) + '</b>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="' + fn + '(1)">' + escHtml(t('tax_next_month')) + ' ▶</button></div>';
  },

  mailStatusHtml: function (d) {
    if (d.mail_status === 'not_required') return '<span class="muted">' + escHtml(t('tax_mail_not_required')) + '</span>';
    if (d.mail_status === 'sent') {
      return '<span class="badge badge-ok">✉ ' + escHtml(t('tax_mail_sent')) + '</span> <span class="mono">' + escHtml(formatDate(d.mailed_at)) + '</span>' +
        (d.mail_tracking ? ' <span class="mono">' + escHtml(d.mail_tracking) + '</span>' : '');
    }
    return '<span class="badge badge-warn">⏳ ' + escHtml(t('tax_mail_pending')) + '</span>';
  },

  printButtonsHtml: function (d) {
    var id = Number(d.id);
    if (!cncTaxDocIsThai(d)) {
      return '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxDoc(' + id + ',\'original\')">🖨 ' + escHtml(t('tax_print')) + '</button>';
    }
    return '<span class="btn-row">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxDoc(' + id + ',\'original\')">' + escHtml(t('tax_print_original')) + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxDoc(' + id + ',\'copy\')">' + escHtml(t('tax_print_copy')) + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxDoc(' + id + ',\'both\')">' + escHtml(t('tax_print_both')) + '</button></span>';
  },

  // 1) 문서 목록
  taxListHtml: function () {
    var st = this.tax;
    var self = this;
    var f = st.filter;
    var html = '<section class="card">' + this.taxMonthNavHtml(st.ym, 'PageAdmin.moveTaxMonth') +
      '<div class="orders-tools">' +
        '<div class="search-box"><label class="sr-only" for="tax-search">' + escHtml(t('tax_search')) + '</label>' +
          '<span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input class="input" id="tax-search" type="search" maxlength="60" value="' + escHtml(f.q) + '" placeholder="' + escHtml(t('tax_search')) + '" onchange="PageAdmin.setTaxFilter(\'q\', this.value)"></div>' +
        '<div class="field"><label class="field-label" for="tax-type">' + escHtml(t('col_type')) + '</label>' +
          '<select class="input" id="tax-type" onchange="PageAdmin.setTaxFilter(\'type\', this.value)">' +
          '<option value="">' + escHtml(t('tax_all')) + '</option>' +
          TAX_DOC_TYPES.map(function (tp) { return '<option value="' + tp + '"' + (f.type === tp ? ' selected' : '') + '>' + escHtml(t(cncTaxDocTypeKey(tp))) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label class="field-label" for="tax-mail">' + escHtml(t('tax_col_mail')) + '</label>' +
          '<select class="input" id="tax-mail" onchange="PageAdmin.setTaxFilter(\'mail\', this.value)">' +
          '<option value="">' + escHtml(t('tax_all')) + '</option>' +
          ['pending', 'sent', 'not_required'].map(function (m) {
            return '<option value="' + m + '"' + (f.mail === m ? ' selected' : '') + '>' + escHtml(t('tax_mail_' + m)) + '</option>';
          }).join('') + '</select></div>' +
      '</div>';
    if (st.error) return html + this.errorBox('PageAdmin.loadTaxList()', st.error) + '</section>';
    if (!st.rows) return html + uiLoading() + '</section>';
    if (!st.rows.length) return html + '<p class="empty-text">' + escHtml(t('tax_docs_empty')) + '</p></section>';
    var tot = cncTaxDocTotals(st.rows);
    html += '<div class="table-wrap admin-table-wrap"><table class="table admin-table docs-table"><thead><tr>' +
      '<th>' + escHtml(t('tax_col_issue_date')) + '</th><th>' + escHtml(t('tax_col_number')) + '</th><th>' + escHtml(t('col_type')) + '</th>' +
      '<th>' + escHtml(t('admin_customer')) + '</th><th>' + escHtml(t('topup_request_no')) + '</th>' +
      '<th class="num">' + escHtml(t('tax_col_amount')) + '</th><th class="num">' + escHtml(t('tax_col_vat')) + '</th><th class="num">' + escHtml(t('tax_col_total')) + '</th>' +
      '<th>' + escHtml(t('tax_col_mail')) + '</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (d) {
        var sign = cncTaxDocSign(d);
        return '<tr class="' + (sign < 0 ? 'doc-refund' : '') + '">' +
          '<td class="mono nowrap">' + escHtml(formatDate(d.issue_date)) +
            (d.approved_date && String(d.approved_date) !== String(d.issue_date) && !cncTaxDocIsRefund(d)
              ? '<br><span class="muted small">' + escHtml(tf('tax_approved_on', { date: formatDate(d.approved_date) })) + '</span>' : '') + '</td>' +
          '<td class="mono nowrap">' + escHtml(d.number) + '</td>' +
          '<td>' + escHtml(t(cncTaxDocTypeKey(d.doc_type))) + '</td>' +
          '<td>' + escHtml(d.buyer_name) + (d.buyer_country && d.buyer_country !== 'TH' ? ' <span class="country-tag mono">' + escHtml(d.buyer_country) + '</span>' : '') +
            (d.buyer_tax_id ? '<br><span class="mono small">' + escHtml(d.buyer_tax_id) + '</span>' : '') + '</td>' +
          '<td class="mono nowrap">' + escHtml(d.topup_id || '—') + '</td>' +
          '<td class="mono nowrap num">' + formatTHB(sign * d.subtotal) + '</td>' +
          '<td class="mono nowrap num">' + formatTHB(sign * d.vat_amount) + '</td>' +
          '<td class="mono nowrap num"><b>' + formatTHB(sign * d.total) + '</b></td>' +
          '<td>' + self.mailStatusHtml(d) + '</td>' +
          '<td>' + self.printButtonsHtml(d) + '</td></tr>';
      }).join('') +
      '<tr class="docs-total"><td colspan="5"><b>' + escHtml(t('tax_month_total')) + '</b> <span class="muted">(' + escHtml(tf('tax_doc_count', { n: tot.count })) + ')</span></td>' +
        '<td class="mono nowrap num">' + formatTHB(tot.subtotal) + '</td><td class="mono nowrap num">' + formatTHB(tot.vat) + '</td>' +
        '<td class="mono nowrap num"><b>' + formatTHB(tot.total) + '</b></td><td colspan="2"></td></tr>' +
      '</tbody></table></div></section>';
    return html;
  },

  moveTaxMonth: function (delta) {
    this.tax.ym = cncTaxShiftMonth(this.tax.ym, delta);
    this.loadTaxList();
  },

  setTaxFilter: function (key, value) {
    this.tax.filter[key] = value;
    this.loadTaxList();
  },

  findTaxDoc: function (id) {
    var st = this.tax;
    var all = [].concat(st.rows || [], st.mail || [], (this.topupDetail && this.topupDetail.docs) || []);
    return all.filter(function (d) { return Number(d.id) === Number(id); })[0];
  },

  printTaxDoc: function (id, mode) {
    var d = this.findTaxDoc(id);
    if (d) TaxDoc.open([d], { mode: mode });
  },

  // 2) 우편 발송
  taxMailHtml: function () {
    var st = this.tax;
    var html = '<section class="card"><h2 class="card-title">✉ ' + escHtml(t('tax_view_mail')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('tax_mail_desc')) + '</p>' +
      (st.company && st.company.mail_cycle === 'each'
        ? '<p class="field-help">' + escHtml(t('tax_mail_cycle_each_hint')) + '</p>'
        : '<p class="field-help">' + escHtml(t('tax_mail_cycle_monthly_hint')) + '</p>');
    if (st.mailError) return html + this.errorBox('PageAdmin.loadTaxMail()', st.mailError) + '</section>';
    if (!st.mail) return html + uiLoading() + '</section>';
    if (!st.mail.length) return html + '<p class="empty-text">' + escHtml(t('tax_mail_none')) + '</p></section>';
    var groups = cncGroupMailDocs(st.mail);
    var picked = st.picked;
    var nPicked = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
    var dis = nPicked ? '' : ' disabled';
    html += '<div class="action-row tax-mail-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.pickAllMail(true)">' + escHtml(t('tax_pick_all')) + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.pickAllMail(false)">' + escHtml(t('tax_pick_none')) + '</button>' +
      '<span class="muted">' + escHtml(tf('tax_picked_n', { n: nPicked })) + '</span></div>' +
      '<div class="action-row tax-mail-actions">' +
      '<button type="button" class="btn btn-primary" onclick="PageAdmin.printPickedOriginals()"' + dis + '>🖨 ' + escHtml(t('tax_print_originals')) + '</button>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.printPickedLabels(\'sheet\')"' + dis + '>🏷 ' + escHtml(t('tax_labels_sheet')) + '</button>' +
      '<button type="button" class="btn btn-outline" onclick="PageAdmin.printPickedLabels(\'envelope\')"' + dis + '>✉ ' + escHtml(t('tax_labels_envelope')) + '</button>' +
      '<button type="button" class="btn btn-gold" onclick="PageAdmin.markPickedMailed()"' + dis + '>✅ ' + escHtml(t('tax_mark_mailed')) + '</button></div>';
    html += groups.map(function (g) {
      var allOn = g.docs.every(function (d) { return picked[d.id]; });
      return '<div class="tax-mail-group">' +
        '<label class="check-line tax-mail-head"><input type="checkbox"' + (allOn ? ' checked' : '') + ' onchange="PageAdmin.pickMailGroup(\'' + escHtml(g.key) + '\', this.checked)"> ' +
          '<b>' + escHtml(g.name) + '</b> <span class="muted mono">' + escHtml(g.month) + '</span> · ' + escHtml(tf('tax_doc_count', { n: g.docs.length })) + '</label>' +
        '<p class="muted pre small">' + escHtml(g.address) + (g.phone ? ' · ' + escHtml(g.phone) : '') + '</p>' +
        '<ul class="tax-mail-docs">' + g.docs.map(function (d) {
          return '<li><label class="check-line"><input type="checkbox"' + (picked[d.id] ? ' checked' : '') + ' onchange="PageAdmin.pickMail(' + Number(d.id) + ', this.checked)"> ' +
            '<span class="mono">' + escHtml(d.number) + '</span> · ' + escHtml(t(cncTaxDocTypeKey(d.doc_type))) + ' · <span class="mono">' + escHtml(formatDate(d.issue_date)) + '</span> · ' +
            '<span class="mono">' + formatTHB(cncTaxDocSign(d) * d.total) + '</span></label></li>';
        }).join('') + '</ul></div>';
    }).join('') + '</section>';
    return html;
  },

  pickMail: function (id, on) {
    this.tax.picked[id] = !!on;
    this.drawTax();
  },

  pickMailGroup: function (key, on) {
    var st = this.tax;
    (st.mail || []).forEach(function (d) {
      if (d.user_id + '|' + String(d.issue_date || '').slice(0, 7) === key) st.picked[d.id] = !!on;
    });
    this.drawTax();
  },

  pickAllMail: function (on) {
    var st = this.tax;
    st.picked = {};
    if (on) (st.mail || []).forEach(function (d) { st.picked[d.id] = true; });
    this.drawTax();
  },

  pickedMailDocs: function () {
    var st = this.tax;
    return (st.mail || []).filter(function (d) { return st.picked[d.id]; });
  },

  printPickedOriginals: function () {
    var docs = this.pickedMailDocs();
    if (docs.length) TaxDoc.open(docs, { mode: 'original' });
  },

  printPickedLabels: function (kind) {
    var docs = this.pickedMailDocs();
    if (docs.length) TaxDoc.labels(cncGroupMailDocs(docs), kind);
  },

  markPickedMailed: function () {
    var self = this;
    var docs = this.pickedMailDocs();
    if (!docs.length) return;
    var today = cncTaxBkkToday();
    var modal = uiModal({
      title: t('tax_mark_mailed'),
      body: '<p class="modal-text">' + escHtml(tf('tax_mark_mailed_text', { n: docs.length })) + '</p>' +
        '<p class="mono small">' + docs.map(function (d) { return escHtml(d.number); }).join(', ') + '</p>' +
        '<div class="field"><label class="field-label" for="tax-mailed-date">' + escHtml(t('tax_mailed_date')) + '</label>' +
          '<input class="input mono" id="tax-mailed-date" type="date" max="' + today + '" value="' + today + '"></div>' +
        '<div class="field"><label class="field-label" for="tax-mailed-track">' + escHtml(t('tax_tracking')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
          '<input class="input mono" id="tax-mailed-track" maxlength="60" placeholder="EF123456789TH"></div>' +
        '<div class="err-slot" id="tax-mailed-err"></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('tax_mark_mailed'), kind: 'primary', onClick: async function (close, btn) {
          var date = modal.el.querySelector('#tax-mailed-date').value || today;
          if (date > today) { modal.el.querySelector('#tax-mailed-err').innerHTML = uiFieldError('tax_err_future_date'); return; }
          btn.disabled = true;
          try {
            var n = await cncAdminMarkMailed(docs.map(function (d) { return d.id; }), date, modal.el.querySelector('#tax-mailed-track').value);
            close();
            uiToast(tf('tax_marked_n', { n: n || docs.length }), 'success');
            self.loadTaxMail();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // 3) 미발행 충전
  taxMissingHtml: function () {
    var st = this.tax;
    var html = '<section class="card"><h2 class="card-title">' + escHtml(t('tax_view_missing')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('tax_missing_desc')) + '</p>';
    if (st.missingError) return html + this.errorBox('PageAdmin.loadTaxMissing()', st.missingError) + '</section>';
    if (!st.missing) return html + uiLoading() + '</section>';
    if (!st.missing.length) return html + '<p class="empty-text">' + escHtml(t('tax_missing_none')) + '</p></section>';
    var self = this;
    html += '<div class="table-wrap admin-table-wrap"><table class="table admin-table"><thead><tr>' +
      '<th>' + escHtml(t('topup_request_no')) + '</th><th>' + escHtml(t('tax_col_approved')) + '</th><th>' + escHtml(t('admin_customer')) + '</th>' +
      '<th>' + escHtml(t('country_short')) + '</th><th>' + escHtml(t('col_type')) + '</th><th class="num">' + escHtml(t('tax_col_total')) + '</th><th></th></tr></thead><tbody>' +
      st.missing.map(function (r) {
        var thai = cncIsThai(r.country || 'TH');
        var busy = st.issuing === r.id;
        var ready = self.canIssueFor(r.country || 'TH');   // 판매자 설정이 안 됐으면 버튼을 막고 작은 안내
        return '<tr><td class="mono nowrap">' + escHtml(r.id) + '</td>' +
          '<td class="mono nowrap">' + escHtml(formatDate(r.approved_at)) + '</td>' +
          '<td>' + escHtml(r.clinic || '') + '</td>' +
          '<td><span class="country-tag mono">' + escHtml(r.country || 'TH') + '</span></td>' +
          '<td>' + escHtml(t(thai ? 'tax_type_invoice' : 'tax_type_receipt')) + '</td>' +
          '<td class="mono nowrap num">' + formatTHB(r.total) + '</td>' +
          '<td>' + self.issueButtonHtml(r.id, ready, busy, false) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    return html;
  },

  // 그 나라 고객의 문서를 지금 발행할 수 있는지 (판매자 설정 — 서버 _tax_invoice_ready / _receipt_ready 와 같은 규칙)
  //   설정을 아직 못 읽었으면 막지 않아요 (서버가 다시 검사)
  canIssueFor: function (country) {
    var c = this.tax.company;
    if (!c) return true;
    return cncIsThai(country || 'TH') ? cncTaxInvoiceReady(c) : cncReceiptReady(c);
  },

  // [발행] 버튼 — 설정이 안 됐으면 비활성 + 버튼 아래 "설정을 마치면 발행할 수 있어요"
  issueButtonHtml: function (topupId, ready, busy, fromDetail) {
    var html = '<button type="button" class="btn btn-primary btn-sm" onclick="PageAdmin.issueTaxDoc(\'' + escHtml(topupId) + '\'' + (fromDetail ? ', true' : '') + ')"' +
      (busy || !ready ? ' disabled' : '') + '>' + escHtml(busy ? t('admin_processing') : t('tax_issue')) + '</button>';
    if (!ready) html += '<p class="field-help tax-issue-help">' + escHtml(t('tax_issue_need_settings')) + '</p>';
    return html;
  },

  // 설정이 빠져서 발행할 수 없을 때 안내 창: 무엇을 입력해야 하는지 + [설정으로] (owner) / owner 에게 요청 (manager)
  showTaxSettingsNeeded: function (code) {
    var self = this;
    var owner = cncHasRole('owner');
    var actions = [{ label: t('btn_close'), kind: 'outline' }];
    if (owner) actions.push({ label: t('tax_go_settings'), kind: 'primary', onClick: function (close) { close(); self.goTaxSettings(); } });
    uiModal({
      title: t('tax_issue'),
      body: '<p class="modal-text">' + escHtml(t(code === 'RECEIPT_SETTINGS_MISSING' ? 'err_receipt_settings_missing' : 'err_tax_settings_missing')) + '</p>' +
        (owner ? '' : '<p class="field-help">' + escHtml(t('tax_settings_ask_owner')) + '</p>'),
      actions: actions
    });
  },

  // 세금계산서 탭 → 설정 (충전 상세 창에서 눌러도 그 창을 닫고 이동)
  goTaxSettings: function () {
    if (this.topupDetail && this.topupDetail.modal) this.topupDetail.modal.close();
    this.tax.view = 'settings';
    if (this.tab !== 'tax') {
      this.tab = 'tax';
      history.replaceState(null, '', '#/admin/tax');
      this.drawFrame();
    }
    this.loadTax();
  },

  issueTaxDoc: async function (topupId, fromDetail) {
    var st = this.tax;
    var ok = await uiConfirm({ title: t('tax_issue'), message: tf('tax_issue_confirm', { id: topupId }), okLabel: t('tax_issue') });
    if (!ok) return;
    st.issuing = topupId;
    this.drawTax();
    try {
      await cncAdminIssueTaxDoc(topupId);
      uiToast(t('tax_issued'), 'success');
    } catch (err) {
      var code = cncErrorCode(err);
      if (code === 'TAX_SETTINGS_MISSING' || code === 'RECEIPT_SETTINGS_MISSING') {
        this.showTaxSettingsNeeded(code);   // 예상한 경우 — 콘솔 오류로 남기지 않아요
      } else {
        console.error(err);
        uiToast(uiErrorMessage(err), 'error');
      }   // ALREADY_ISSUED · NOT_APPROVED 등은 공통 안내 (ui/layout.js uiErrorMessage)
      this.loadTaxCompany();   // 그 사이 설정이 바뀌었을 수 있어서 버튼 상태를 다시
    }
    st.issuing = null;
    if (fromDetail && this.topupDetail) this.loadTopupDocs(this.topupDetail);
    if (st.view === 'missing' && this.tab === 'tax') this.loadTaxMissing();
  },

  // 4) 보고서 (owner)
  taxReportTableHtml: function (rows, totals, overseas) {
    if (!rows.length) return '<p class="empty-text">' + escHtml(t('tax_docs_empty')) + '</p>';
    return '<div class="table-wrap admin-table-wrap"><table class="table admin-table docs-table"><thead><tr>' +
      '<th>' + escHtml(t('tax_col_issue_date')) + '</th><th>' + escHtml(t('tax_col_number')) + '</th><th>' + escHtml(t('col_type')) + '</th>' +
      '<th>' + escHtml(t('tax_col_buyer')) + '</th>' +
      (overseas ? '<th>' + escHtml(t('country_short')) + '</th>' : '<th>Tax ID</th><th>' + escHtml(t('tax_doc_branch')) + '</th>') +
      '<th class="num">' + escHtml(t('tax_col_amount')) + '</th><th class="num">' + escHtml(t('tax_col_vat')) + '</th><th class="num">' + escHtml(t('tax_col_total')) + '</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var neg = Number(r.total) < 0;
        return '<tr class="' + (neg ? 'doc-refund' : '') + '"><td class="mono nowrap">' + escHtml(formatDate(r.issue_date)) + '</td>' +
          '<td class="mono nowrap">' + escHtml(r.number) + '</td><td>' + escHtml(t(cncTaxDocTypeKey(r.doc_type))) + '</td>' +
          '<td>' + escHtml(r.buyer_name || '') + '</td>' +
          (overseas ? '<td class="mono">' + escHtml(r.buyer_country || '') + '</td>'
            : '<td class="mono nowrap">' + escHtml(r.buyer_tax_id || '') + '</td><td>' + escHtml(cncBranchText(r.buyer_branch)) + '</td>') +
          '<td class="mono nowrap num">' + formatTHB(r.subtotal) + '</td><td class="mono nowrap num">' + formatTHB(r.vat_amount) + '</td>' +
          '<td class="mono nowrap num"><b>' + formatTHB(r.total) + '</b></td></tr>';
      }).join('') +
      '<tr class="docs-total"><td colspan="' + (overseas ? 5 : 6) + '"><b>' + escHtml(t('tax_month_total')) + '</b></td>' +
        '<td class="mono nowrap num">' + formatTHB(totals.subtotal) + '</td><td class="mono nowrap num">' + formatTHB(totals.vat_amount) + '</td>' +
        '<td class="mono nowrap num"><b>' + formatTHB(totals.total) + '</b></td></tr>' +
      '</tbody></table></div>';
  },

  taxReportHtml: function () {
    var st = this.tax;
    var html = '<section class="card">' + this.taxMonthNavHtml(st.reportYm, 'PageAdmin.moveReportMonth');
    if (st.reportError) return html + this.errorBox('PageAdmin.loadTaxReport()', st.reportError) + '</section>';
    if (!st.report) return html + uiLoading() + '</section>';
    var r = st.report;
    html += '<h2 class="card-title">' + escHtml(t('tax_report_output')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('tax_report_output_desc')) + '</p>' +
      '<div class="action-row"><button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxReport(\'output\')">🖨 ' + escHtml(t('tax_print')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.csvTaxReport(\'output\')">⬇ CSV</button></div>' +
      this.taxReportTableHtml(r.output, r.outputTotals, false) +
      '</section><section class="card">' +
      '<h2 class="card-title">' + escHtml(t('tax_report_overseas')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('tax_report_overseas_desc')) + '</p>' +
      '<div class="action-row"><button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.printTaxReport(\'overseas\')">🖨 ' + escHtml(t('tax_print')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.csvTaxReport(\'overseas\')">⬇ CSV</button></div>' +
      this.taxReportTableHtml(r.overseas, r.overseasTotals, true) + '</section>';
    return html;
  },

  moveReportMonth: function (delta) {
    this.tax.reportYm = cncTaxShiftMonth(this.tax.reportYm, delta);
    this.loadTaxReport();
  },

  reportFileStem: function (kind) {
    var ym = this.tax.reportYm;
    return (kind === 'output' ? 'output-tax-' : 'overseas-sales-') + ym.y + '-' + (ym.m < 10 ? '0' : '') + ym.m;
  },

  csvTaxReport: function (kind) {
    var r = this.tax.report;
    if (!r) return;
    var csv = kind === 'output' ? cncTaxReportCsv(r.output, r.outputTotals) : cncTaxReportCsv(r.overseas, r.overseasTotals);
    cncTaxDownload(this.reportFileStem(kind) + '.csv', csv);
  },

  printTaxReport: function (kind) {
    var r = this.tax.report;
    if (!r) return;
    var c = this.tax.company || {};
    var over = kind === 'overseas';
    var title = over ? 'Overseas sales (receipts)' : 'รายงานภาษีขาย / Output tax report';
    var ym = this.tax.reportYm;
    var body = '<section class="page"><div class="head"><div><div class="logo">allAbut</div><div class="seller"><b>' + escHtml(c.seller_name_th || c.company_name || '') + '</b>' +
      (c.tax_id ? '<br>Tax ID <span class="mono">' + escHtml(c.tax_id) + '</span> · ' + escHtml(cncBranchText(c.seller_branch)) : '') + '</div></div>' +
      '<div class="title"><h1 style="font-size:16px">' + escHtml(title) + '</h1><div class="en mono">' + ym.y + '-' + (ym.m < 10 ? '0' : '') + ym.m + '</div></div></div>' +
      this.taxReportTableHtml(over ? r.overseas : r.output, over ? r.overseasTotals : r.outputTotals, over).replace(/class="table admin-table docs-table"/, 'class="items"') +
      '</section>';
    TaxDoc.writeWindow(TaxDoc.fullHtml(this.reportFileStem(kind), body, ''));
  },

  // 5) 설정 (owner)
  taxSettingsHtml: function () {
    var st = this.tax;
    if (st.settingsError) return this.errorBox('PageAdmin.loadTaxCompany()', st.settingsError);
    var c = st.company;
    if (!c) return '<div class="card">' + uiLoading() + '</div>';
    if (!cncHasTaxSettings(c)) return '<div class="card"><p class="empty-text">' + escHtml(t('tax_missing_sql')) + '</p></div>';
    var p = st.payment || {};
    function text(id, labelKey, value, opts) {
      opts = opts || {};
      return '<div class="field' + (opts.span ? ' span-2' : '') + '"><label class="field-label" for="ts-' + id + '">' + escHtml(t(labelKey)) + '</label>' +
        (opts.textarea
          ? '<textarea class="input textarea" id="ts-' + id + '" rows="3" maxlength="500">' + escHtml(value || '') + '</textarea>'
          : '<input class="input' + (opts.mono ? ' mono' : '') + '" id="ts-' + id + '" maxlength="' + (opts.max || 200) + '"' + (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
            (opts.placeholder ? ' placeholder="' + escHtml(opts.placeholder) + '"' : '') + ' value="' + escHtml(value || '') + '">') +
        (opts.help ? '<p class="field-help">' + escHtml(t(opts.help)) + '</p>' : '') + '</div>';
    }
    return '<section class="card"><h2 class="card-title">' + escHtml(t('tax_settings_title')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('tax_settings_desc')) + '</p>' +
      '<form class="form-grid two" onsubmit="PageAdmin.saveTaxSettings(event)" novalidate>' +
        '<div class="field span-2"><label class="check-line"><input type="checkbox" id="ts-vat"' + (c.vat_registered ? ' checked' : '') + '> ' +
          escHtml(t('tax_vat_registered')) + '</label><p class="field-help">' + escHtml(t('tax_vat_registered_help')) + '</p></div>' +
        text('name_th', 'tax_seller_name_th', c.seller_name_th) +
        text('name_en', 'tax_seller_name_en', c.seller_name_en, { placeholder: c.company_name || '' }) +
        text('addr_th', 'tax_seller_addr_th', c.seller_address_th, { textarea: true }) +
        text('addr_en', 'tax_seller_addr_en', c.seller_address_en, { textarea: true }) +
        text('tax_id', 'tax_seller_tax_id', c.tax_id, { mono: true, max: 20, inputmode: 'numeric', help: 'tax_seller_tax_id_help' }) +
        text('branch', 'tax_seller_branch', c.seller_branch, { mono: true, max: 5, inputmode: 'numeric', placeholder: '00001', help: 'tax_seller_branch_help' }) +
        '<div class="field"><label class="field-label" for="ts-cycle">' + escHtml(t('tax_mail_cycle')) + '</label>' +
          '<select class="input" id="ts-cycle">' +
            '<option value="monthly"' + (c.mail_cycle !== 'each' ? ' selected' : '') + '>' + escHtml(t('tax_mail_cycle_monthly')) + '</option>' +
            '<option value="each"' + (c.mail_cycle === 'each' ? ' selected' : '') + '>' + escHtml(t('tax_mail_cycle_each')) + '</option>' +
          '</select><p class="field-help">' + escHtml(t('tax_mail_cycle_help')) + '</p></div>' +
        ('overseas_vat_mode' in p ? '<div class="field"><label class="field-label" for="ts-ovat">' + escHtml(t('tax_overseas_vat')) + '</label>' +
          '<select class="input" id="ts-ovat">' +
            '<option value="charge"' + (p.overseas_vat_mode !== 'zero' ? ' selected' : '') + '>' + escHtml(tf('tax_overseas_vat_charge', { n: formatNumber(p.vat_rate || 0) })) + '</option>' +
            '<option value="zero"' + (p.overseas_vat_mode === 'zero' ? ' selected' : '') + '>' + escHtml(t('tax_overseas_vat_zero')) + '</option>' +
          '</select><p class="field-help">⚠ ' + escHtml(t('tax_overseas_vat_note')) + '</p></div>' : '') +
        '<div class="err-slot span-2" id="ts-err"></div>' +
        '<div class="span-2 form-actions"><button type="submit" class="btn btn-primary"' + (st.saving ? ' disabled' : '') + '>' +
          escHtml(st.saving ? t('saving') : t('pe_save')) + '</button></div>' +
      '</form></section>';
  },

  saveTaxSettings: async function (event) {
    event.preventDefault();
    var st = this.tax;
    if (st.saving) return;
    var v = function (id) { var el = document.getElementById('ts-' + id); return el ? el.value.trim() : ''; };
    var fields = {
      vat_registered: !!(document.getElementById('ts-vat') || {}).checked,
      seller_name_th: v('name_th'), seller_name_en: v('name_en'),
      seller_address_th: v('addr_th'), seller_address_en: v('addr_en'),
      seller_branch: v('branch'), mail_cycle: v('cycle'), tax_id: v('tax_id'),
      overseas_vat_mode: document.getElementById('ts-ovat') ? v('ovat') : ''
    };
    var err = '';
    if (fields.seller_branch && !cncValidBranch(cncNormBranch(fields.seller_branch))) err = 'tax_branch_invalid';
    else if (fields.tax_id && !cncValidTaxId(fields.tax_id, 'TH')) err = 'err_tax_id_checksum';
    else if (fields.vat_registered && (!fields.seller_name_th || !fields.seller_address_th || !fields.tax_id)) err = 'tax_err_vat_fields';
    var slot = document.getElementById('ts-err');
    if (err) { if (slot) slot.innerHTML = uiFieldError(err); return; }
    st.saving = true;
    this.drawTax();
    try {
      st.company = await cncAdminSaveTaxSettings(fields);
      if (fields.overseas_vat_mode && st.payment) st.payment.overseas_vat_mode = fields.overseas_vat_mode;
      uiToast(t('admin_settings_saved'), 'success');
    } catch (e) {
      console.error(e);
      uiToast(uiErrorMessage(e), 'error');
    }
    st.saving = false;
    this.drawTax();
  },

  // ----------------------------------------------------------------
  // 충전 상세 (Top-ups 탭) 안의 "세금계산서 · 영수증" 줄 — page-admin.js 의 drawTopupDetail 이 불러요
  // ----------------------------------------------------------------
  loadTopupDocs: async function (st) {
    if (!st) return;
    try {
      st.docs = await cncAdminTaxDocsOfTopup(st.row.id);
    } catch (err) {
      st.docs = [];
    }
    // 문서가 없으면 [발행] 버튼 상태를 위해 판매자 설정 · 고객 등록 국가도 읽어요
    if (st.docs && !st.docs.length) {
      try {
        if (!this.tax.company) {
          var c = await sb.from('company_settings').select('*').eq('id', 1).maybeSingle();
          if (!c.error) this.tax.company = c.data || {};
        }
        var p = await sb.from('profiles').select('*').eq('id', st.row.user_id).maybeSingle();
        st.country = p.data ? cncProfileCountry(p.data) : 'TH';
      } catch (e) { st.country = 'TH'; }
    }
    if (this.topupDetail === st) this.drawTopupDetail();
  },

  topupDocsHtml: function (st) {
    var self = this;
    if (st.docs === null || st.docs === undefined) return '';
    var html = '<section class="topup-docs"><h3 class="detail-title">🧾 ' + escHtml(t('tax_docs_title')) + '</h3>';
    if (!st.docs.length) {
      return html + '<p class="muted">' + escHtml(t('tax_topup_no_doc')) + '</p>' +
        (cncHasRole('manager') ? this.issueButtonHtml(st.row.id, this.canIssueFor(st.country || 'TH'), false, true) : '') +
        '</section>';
    }
    return html + '<ul class="topup-doc-list">' + st.docs.map(function (d) {
      return '<li class="' + (cncTaxDocIsRefund(d) ? 'doc-refund' : '') + '"><span class="mono">' + escHtml(d.number) + '</span> · ' + escHtml(t(cncTaxDocTypeKey(d.doc_type))) +
        ' · <span class="mono">' + escHtml(formatDate(d.issue_date)) + '</span> · <span class="mono">' + formatTHB(cncTaxDocSign(d) * d.total) + '</span> ' +
        (cncTaxDocIsThai(d) ? self.mailStatusHtml(d) : '') + ' ' + self.printButtonsHtml(d) + '</li>';
    }).join('') + '</ul></section>';
  }
});
