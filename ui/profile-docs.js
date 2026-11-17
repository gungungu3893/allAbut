// ===== 내 정보 → 세금계산서 · 영수증 섹션 (sql/021) =====
// PageProfile.draw() 가 <section id="profile-docs"> 를 만들고 ProfileDocs.mount(box) 를 불러요.
//   - 문서에 들어갈 정보: 이름(기본 = 치과 이름) · 주소(기본 = 등록 주소) · 지점(태국만: 본사 / 지점 번호 5자리)
//     → 저장해도 이미 발행된 문서는 바뀌지 않아요 (다음 문서부터)
//   - 월별 목록 (◀ 지난달 · 다음 달 ▶): 발행일 · 번호 · 종류 · 내용 · 금액 · VAT · 합계 · [보기 / 출력]
//     세금계산서 · 크레딧 노트는 우편 상태 ("우편 발송 준비 중" / "발송 완료 · 날짜 · 등기번호")
//     크레딧 노트 · 환불 영수증은 빨간 글씨 (금액 마이너스)
//   - 월 합계 줄 + [이 달 전체 출력]
//   - 태국 고객이 출력한 세금계산서는 확인용 (워터마크) — 정식 원본은 우편으로 가요
//   - 해외 고객은 제목이 "영수증" — 출력한 영수증이 정식 사본이에요

var ProfileDocs = {
  box: null,
  ym: null,
  docs: null,
  error: false,
  loadToken: 0,
  editing: false,
  saving: false,

  mount: async function (box) {
    this.box = box;
    if (!box) return;
    if (!this.ym) this.ym = cncBkkThisMonth();
    var ready = await cncTaxTableReady();
    if (!ready || !cncHasCountryColumns(APP.profile || {})) { box.hidden = true; return; }   // 021 실행 전
    box.hidden = false;
    this.draw();
    this.load();
  },

  load: async function () {
    var token = ++this.loadToken;
    this.docs = null;
    this.error = false;
    this.draw();
    try {
      var rows = await cncListMyTaxDocs(this.ym);
      if (token !== this.loadToken) return;
      this.docs = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.error = true;
    }
    this.draw();
  },

  move: function (delta) {
    this.ym = cncTaxShiftMonth(this.ym, delta);
    this.load();
  },

  // 문서에 들어갈 정보 (비어 있으면 기본값을 보여줘요)
  infoHtml: function (p, thai) {
    var reg = cncRegisteredClinic(p) || {};
    var name = p.doc_name || '';
    var addr = p.doc_address || '';
    var branch = p.doc_branch || '';
    var missing = cncDocInfoMissing(p);
    var html = '<div class="docs-info">' +
      '<h3 class="detail-title">' + escHtml(t('tax_docinfo_title')) + '</h3>';
    if (missing && !this.editing) {
      html += '<div class="notice notice-warn" role="status"><p><span aria-hidden="true">ℹ</span> ' + escHtml(t('tax_docinfo_missing')) + '</p></div>';
    }
    if (!this.editing) {
      html += '<div class="kv-list">' +
        '<p><span class="muted">' + escHtml(t('tax_doc_name')) + '</span> ' + escHtml(name || reg.clinic || p.clinic_name || '—') + '</p>' +
        '<p class="pre"><span class="muted">' + escHtml(t('tax_doc_address')) + '</span> ' + escHtml(addr || reg.addr || p.address || '—') + '</p>' +
        (p.tax_id ? '<p><span class="muted">' + escHtml(thai ? t('clinic_tax_id_label') : t('tax_vat_optional_label')) + '</span> <span class="mono">' + escHtml(cncFormatTaxId(p.tax_id)) + '</span></p>' : '') +
        (thai ? '<p><span class="muted">' + escHtml(t('tax_doc_branch')) + '</span> ' + escHtml(branch ? tf('tax_branch_no', { n: branch }) : t('tax_branch_hq')) + '</p>' : '') +
        '</div>' +
        '<p class="field-help">' + escHtml(t('tax_docinfo_help')) + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="ProfileDocs.edit(true)">' + escHtml(t('tax_docinfo_edit')) + '</button>';
    } else {
      html += '<form class="form-grid two" onsubmit="ProfileDocs.saveInfo(event)" novalidate>' +
        '<div class="field span-2"><label class="field-label" for="pd-name">' + escHtml(t('tax_doc_name')) + '</label>' +
          '<input class="input" id="pd-name" maxlength="200" value="' + escHtml(name || reg.clinic || p.clinic_name || '') + '"></div>' +
        '<div class="field span-2"><label class="field-label" for="pd-addr">' + escHtml(t('tax_doc_address')) + '</label>' +
          '<textarea class="input textarea" id="pd-addr" rows="3" maxlength="500">' + escHtml(addr || reg.addr || p.address || '') + '</textarea></div>' +
        (thai ? '<div class="field"><span class="field-label">' + escHtml(t('tax_doc_branch')) + '</span>' +
          '<label class="check-line"><input type="radio" name="pd-branch-kind" value="hq"' + (branch ? '' : ' checked') + ' onchange="ProfileDocs.branchKind()"> ' + escHtml(t('tax_branch_hq')) + '</label>' +
          '<label class="check-line"><input type="radio" name="pd-branch-kind" value="branch"' + (branch ? ' checked' : '') + ' onchange="ProfileDocs.branchKind()"> ' + escHtml(t('tax_branch_label')) + '</label>' +
          '<input class="input mono" id="pd-branch" inputmode="numeric" maxlength="5" placeholder="00001" value="' + escHtml(branch) + '"' + (branch ? '' : ' hidden') + '>' +
          '<div class="err-slot" id="pd-branch-err"></div></div>' : '') +
        '<p class="field-help span-2">' + escHtml(t('tax_docinfo_help')) + '</p>' +
        '<div class="span-2 form-actions">' +
          '<button type="button" class="btn btn-outline" onclick="ProfileDocs.edit(false)">' + escHtml(t('btn_cancel')) + '</button>' +
          '<button type="submit" class="btn btn-primary"' + (this.saving ? ' disabled' : '') + '>' + escHtml(this.saving ? t('saving') : t('pe_save')) + '</button>' +
        '</div></form>';
    }
    return html + '</div>';
  },

  edit: function (on) {
    this.editing = !!on;
    this.draw();
  },

  branchKind: function () {
    var kind = (this.box.querySelector('input[name="pd-branch-kind"]:checked') || {}).value;
    var el = this.box.querySelector('#pd-branch');
    if (el) el.hidden = kind !== 'branch';
  },

  saveInfo: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var box = this.box;
    var kindEl = box.querySelector('input[name="pd-branch-kind"]:checked');
    var branch = kindEl && kindEl.value === 'branch' ? cncNormBranch(box.querySelector('#pd-branch').value) : '';
    if (kindEl && kindEl.value === 'branch' && !cncValidBranch(branch)) {
      box.querySelector('#pd-branch-err').innerHTML = uiFieldError('tax_branch_invalid');
      return;
    }
    this.saving = true;
    this.draw();
    try {
      await cncSaveDocInfo({ doc_name: box.querySelector('#pd-name').value, doc_address: box.querySelector('#pd-addr').value, doc_branch: branch });
      this.saving = false;
      this.editing = false;
      uiToast(t('profile_saved'), 'success');
    } catch (err) {
      console.error(err);
      this.saving = false;
      uiToast(cncErrorCode(err) === 'BRANCH_INVALID' ? t('tax_branch_invalid') : uiErrorMessage(err), 'error');
    }
    this.draw();
  },

  // 우편 상태 (세금계산서 · 크레딧 노트만)
  mailHtml: function (d) {
    if (!cncTaxDocIsThai(d)) return '';
    if (d.mail_status === 'sent') {
      return '<p class="doc-mail sent"><span aria-hidden="true">✉</span> ' + escHtml(t('tax_mail_sent')) +
        ' · <span class="mono">' + escHtml(formatDate(d.mailed_at)) + '</span>' +
        (d.mail_tracking ? ' · <span class="mono">' + escHtml(d.mail_tracking) + '</span>' : '') + '</p>';
    }
    return '<p class="doc-mail"><span aria-hidden="true">⏳</span> ' + escHtml(t('tax_mail_pending')) + '</p>';
  },

  draw: function () {
    var box = this.box;
    if (!box) return;
    var p = APP.profile || {};
    var thai = cncIsThai(cncProfileCountry(p));
    var self = this;
    var html = '<h2 class="card-title"><span aria-hidden="true">🧾</span> ' + escHtml(t(thai ? 'tax_docs_title' : 'tax_docs_title_receipt')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t(thai ? 'tax_docs_desc' : 'tax_docs_desc_receipt')) + '</p>' +
      this.infoHtml(p, thai) +
      '<div class="docs-month">' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="ProfileDocs.move(-1)">◀ ' + escHtml(t('tax_prev_month')) + '</button>' +
        '<b class="docs-month-label">' + escHtml(cncMonthLabel(this.ym, currentLang)) + '</b>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="ProfileDocs.move(1)">' + escHtml(t('tax_next_month')) + ' ▶</button>' +
      '</div>';

    if (this.error) {
      html += '<p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="ProfileDocs.load()">' + escHtml(t('btn_retry')) + '</button>';
    } else if (this.docs === null) {
      html += uiLoading();
    } else if (!this.docs.length) {
      html += '<p class="empty-text">' + escHtml(t('tax_docs_empty')) + '</p>';
    } else {
      var tot = cncTaxDocTotals(this.docs);
      html += '<div class="table-wrap"><table class="table docs-table"><thead><tr>' +
        '<th>' + escHtml(t('tax_col_issue_date')) + '</th><th>' + escHtml(t('tax_col_number')) + '</th><th>' + escHtml(t('col_type')) + '</th>' +
        '<th>' + escHtml(t('col_description')) + '</th><th class="num">' + escHtml(t('tax_col_amount')) + '</th><th class="num">' + escHtml(t('tax_col_vat')) + '</th>' +
        '<th class="num">' + escHtml(t('tax_col_total')) + '</th><th></th></tr></thead><tbody>' +
        this.docs.map(function (d) {
          var sign = cncTaxDocSign(d);
          var neg = sign < 0;
          return '<tr class="' + (neg ? 'doc-refund' : '') + '">' +
            '<td class="mono nowrap">' + escHtml(formatDate(d.issue_date)) + '</td>' +
            '<td class="mono nowrap">' + escHtml(d.number) + '</td>' +
            '<td>' + escHtml(t(cncTaxDocTypeKey(d.doc_type))) + self.mailHtml(d) + '</td>' +
            '<td>' + escHtml(cncTaxDocDescription(d)) + '</td>' +
            '<td class="mono nowrap num">' + formatTHB(sign * d.subtotal) + '</td>' +
            '<td class="mono nowrap num">' + formatTHB(sign * d.vat_amount) + '</td>' +
            '<td class="mono nowrap num"><b>' + formatTHB(sign * d.total) + '</b></td>' +
            '<td><button type="button" class="btn btn-outline btn-sm" onclick="ProfileDocs.print(' + Number(d.id) + ')">' + escHtml(t('tax_view_print')) + '</button></td>' +
            '</tr>';
        }).join('') +
        '<tr class="docs-total"><td colspan="4"><b>' + escHtml(t('tax_month_total')) + '</b> <span class="muted">(' + escHtml(tf('tax_doc_count', { n: tot.count })) + ')</span></td>' +
          '<td class="mono nowrap num">' + formatTHB(tot.subtotal) + '</td><td class="mono nowrap num">' + formatTHB(tot.vat) + '</td>' +
          '<td class="mono nowrap num"><b>' + formatTHB(tot.total) + '</b></td><td></td></tr>' +
        '</tbody></table></div>' +
        '<div class="form-actions"><button type="button" class="btn btn-primary" onclick="ProfileDocs.printAll()">🖨 ' + escHtml(t('tax_print_month')) + '</button></div>';
      if (thai) html += '<p class="field-help">' + escHtml(t('tax_ref_note')) + '</p>';
    }
    box.innerHTML = html;
  },

  // 고객 출력: 세금계산서 · 크레딧 노트는 확인용(워터마크), 영수증은 정식 사본
  print: function (id) {
    var d = (this.docs || []).filter(function (x) { return Number(x.id) === Number(id); })[0];
    if (d) TaxDoc.open([d], { mode: 'reference' });
  },

  printAll: function () {
    if (this.docs && this.docs.length) TaxDoc.open(this.docs, { mode: 'reference' });
  }
};
