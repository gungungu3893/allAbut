// ===== 세금계산서 · 영수증 A4 출력 (sql/021) =====
// 새 창(출력 미리보기)에 A4 한 장씩 그리고, 위쪽 [출력] 버튼으로 프린터에 보내요 (버튼은 종이에 안 나와요).
//
//   TaxDoc.open(docs, { mode })
//     docs : tax_invoices 줄 배열 (한 장이어도 배열)
//     mode : 'original'  관리자 원본 (ต้นฉบับ / ORIGINAL)        — 워터마크 없음
//            'copy'      관리자 사본 (สำเนา / COPY)
//            'both'      원본 + 사본 둘 다 (문서마다 2장)
//            'reference' 고객이 출력한 세금계산서 → "สำเนาเพื่อตรวจสอบ / For reference" 워터마크 + 확인용 안내
//            (영수증 · 환불 영수증은 mode 와 상관없이 한 장, 고객이 출력한 것이 정식 사본이에요)
//
//   TaxDoc.labels(groups)  주소 라벨 출력 (A4 라벨 한 장에 8칸 또는 창봉투용 1장씩)
//
// 세금계산서 필수 내용 (태국 국세법 86/4): 제목 · 판매자 이름/주소/Tax ID/지점 · 구매자 이름/주소/Tax ID/지점 ·
//   번호 · 품목(수량, 단가, 금액) · VAT 따로 (มูลค่าสินค้า / ภาษีมูลค่าเพิ่ม / จำนวนเงินรวมทั้งสิ้น) · 발행일
// 글씨: 세금계산서 = 태국어 먼저 + 작은 영어 (IBM Plex Sans Thai) / 영수증 = 영어만. 숫자는 IBM Plex Mono.

var TaxDoc = {

  // 날짜: 세금계산서 dd/mm/yyyy, 영수증 17 Nov 2026
  dateTh: function (d) {
    var s = String(d || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  },
  dateEn: function (d) {
    var s = String(d || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (+s.slice(8, 10)) + ' ' + months[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
  },
  money: function (n) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  pct: function (n) {
    var v = Number(n || 0);
    return (Math.round(v * 100) / 100).toString();
  },

  // ----------------------------------------------------------------
  // 공통 CSS (흰 바탕 · 검정 글씨 · A4 한 장)
  // ----------------------------------------------------------------
  css: function () {
    return '' +
      '@page { size: A4; margin: 0; }' +
      '* { box-sizing: border-box; }' +
      'html, body { margin: 0; padding: 0; background: #E9ECEF; color: #000; }' +
      'body { font-family: "IBM Plex Sans Thai", "IBM Plex Sans", sans-serif; font-size: 12px; line-height: 1.45; }' +
      '.mono { font-family: "IBM Plex Mono", monospace; }' +
      '.toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap;' +
        ' padding: 10px 16px; background: #0B1F3A; color: #fff; font-family: "IBM Plex Sans", sans-serif; }' +
      '.toolbar button { font: inherit; font-weight: 600; padding: 8px 18px; border-radius: 6px; border: 0; cursor: pointer; background: #fff; color: #0B1F3A; }' +
      '.toolbar .tb-note { font-size: 12px; opacity: .85; }' +
      '.page { position: relative; width: 210mm; min-height: 297mm; margin: 12px auto; padding: 16mm 15mm 14mm; background: #fff; overflow: hidden; page-break-after: always; }' +
      '.page:last-child { page-break-after: auto; }' +
      '.wm { position: absolute; left: 0; right: 0; top: 42%; text-align: center; transform: rotate(-24deg); font-size: 46px; font-weight: 700;' +
        ' color: rgba(0,0,0,.08); white-space: nowrap; pointer-events: none; }' +
      '.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }' +
      '.logo { font-family: "IBM Plex Sans", sans-serif; font-weight: 700; font-size: 18px; letter-spacing: -.02em; }' +
      '.seller { font-size: 11px; margin-top: 4px; max-width: 105mm; }' +
      '.seller b { font-size: 13px; }' +
      '.title { text-align: right; }' +
      '.title h1 { margin: 0; font-size: 20px; line-height: 1.2; }' +
      '.title .en { font-size: 12px; font-weight: 600; letter-spacing: .04em; }' +
      '.copy-label { display: inline-block; margin-top: 6px; border: 1.5px solid #000; padding: 2px 10px; font-weight: 700; font-size: 12px; }' +
      '.set-note { font-size: 10px; margin-top: 3px; }' +
      '.meta { display: grid; grid-template-columns: 1fr 84mm; gap: 12px; margin-top: 12px; }' +
      '.kv .mono { white-space: nowrap; }' +
      '.box { border: 1px solid #000; padding: 8px 10px; }' +
      '.box h3 { margin: 0 0 4px; font-size: 11px; font-weight: 600; }' +
      '.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; }' +
      '.kv span:nth-child(odd) { white-space: nowrap; }' +
      '.small { font-size: 10px; color: #333; }' +
      'table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }' +
      'table.items th, table.items td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }' +
      'table.items th { font-size: 11px; font-weight: 600; background: #F2F2F2; text-align: left; }' +
      'table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }' +
      '.sum { display: grid; grid-template-columns: 1fr 78mm; gap: 12px; margin-top: 10px; align-items: start; }' +
      '.sum table { width: 100%; border-collapse: collapse; }' +
      '.sum td { border: 1px solid #000; padding: 5px 8px; }' +
      '.sum td.num { text-align: right; white-space: nowrap; }' +
      '.sum tr.grand td { font-weight: 700; font-size: 13px; }' +
      '.words { border: 1px solid #000; padding: 8px 10px; }' +
      '.cn { margin-top: 12px; }' +
      '.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 26px; }' +
      '.sign div { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; min-height: 22mm; }' +
      '.foot { margin-top: 14px; font-size: 10px; color: #333; }' +
      '.ref-note { margin-top: 12px; border: 1.5px dashed #000; padding: 8px 10px; font-weight: 600; }' +
      '.label-sheet { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 67mm; gap: 0; padding: 10mm 6mm; }' +
      '.label { padding: 8mm 7mm; font-size: 13px; line-height: 1.5; overflow: hidden; border: 1px dashed #BBB; }' +
      '.label b { font-size: 14px; }' +
      '.envelope { padding: 45mm 20mm 0 110mm; font-size: 14px; line-height: 1.6; }' +
      '@media print { html, body { background: #fff; } .toolbar { display: none; } .page { margin: 0; } .label { border-color: transparent; } }';
  },

  // ----------------------------------------------------------------
  // 세금계산서 · 크레딧 노트 (태국어 먼저 + 작은 영어)
  // ----------------------------------------------------------------
  thaiDocHtml: function (d, copyKind, ref) {
    var self = this;
    var isCn = d.doc_type === 'credit_note';
    var items = Array.isArray(d.items) ? d.items : [];
    var titleTh = isCn ? 'ใบลดหนี้' : 'ใบกำกับภาษี';
    var titleEn = isCn ? 'CREDIT NOTE' : 'TAX INVOICE';
    var label = copyKind === 'original' ? 'ต้นฉบับ / ORIGINAL' : copyKind === 'copy' ? 'สำเนา / COPY' : 'สำเนาเพื่อตรวจสอบ / FOR REFERENCE';

    var rows = items.map(function (it, i) {
      return '<tr><td class="mono">' + (i + 1) + '</td>' +
        '<td>' + escHtml(it.name_th || '') + (it.name_th ? '<br>' : '') + '<span class="small">' + escHtml(it.name_en || '') + '</span></td>' +
        '<td class="num mono">' + formatNumber(it.qty || 0) + '</td>' +
        '<td class="num mono">' + self.money(it.unit_price) + '</td>' +
        '<td class="num mono">' + self.money(it.amount) + '</td></tr>';
    }).join('');

    var cnHtml = '';
    if (isCn) {
      cnHtml = '<div class="box cn"><div class="kv">' +
        '<span>อ้างอิงใบกำกับภาษีเลขที่ <span class="small">Original invoice</span></span><span class="mono">' + escHtml(ref ? ref.number : '—') + '</span>' +
        '<span>ลงวันที่ <span class="small">Original date</span></span><span class="mono">' + escHtml(ref ? self.dateTh(ref.issue_date) : '—') + '</span>' +
        '<span>มูลค่าตามใบกำกับภาษีเดิม <span class="small">Original value</span></span><span class="mono">' + self.money(d.original_subtotal) + '</span>' +
        '<span>มูลค่าที่ถูกต้อง <span class="small">Correct value</span></span><span class="mono">' + self.money(d.correct_subtotal) + '</span>' +
        '<span>ผลต่าง <span class="small">Difference</span></span><span class="mono">' + self.money(d.subtotal) + '</span>' +
        '<span>เหตุผล <span class="small">Reason</span></span><span>' + escHtml(d.reason || '') + '</span>' +
        '</div></div>';
    }

    var approvedLate = d.approved_date && String(d.approved_date).slice(0, 10) !== String(d.issue_date).slice(0, 10);

    return '<section class="page">' +
      (copyKind === 'reference' ? '<div class="wm">สำเนาเพื่อตรวจสอบ / For reference</div>' : '') +
      '<div class="head">' +
        '<div><div class="logo">allAbut</div>' +
          '<div class="seller"><b>' + escHtml(d.seller_name || '') + '</b>' +
            (d.seller_name_en ? '<br><span class="small">' + escHtml(d.seller_name_en) + '</span>' : '') +
            '<br>' + escHtml(d.seller_address || '') +
            '<br>เลขประจำตัวผู้เสียภาษี <span class="small">Tax ID</span> <span class="mono">' + escHtml(d.seller_tax_id || '') + '</span>' +
            ' · ' + escHtml(cncBranchText(d.seller_branch)) + ' <span class="small">' + escHtml(cncBranchText(d.seller_branch, true)) + '</span></div></div>' +
        '<div class="title"><h1>' + titleTh + '</h1><div class="en">' + titleEn + '</div>' +
          '<div class="copy-label">' + label + '</div>' +
          '<div class="set-note">เอกสารออกเป็นชุด</div></div>' +
      '</div>' +
      '<div class="meta">' +
        '<div class="box"><h3>ผู้ซื้อ <span class="small">Buyer</span></h3>' +
          '<b>' + escHtml(d.buyer_name || '') + '</b><br>' + escHtml(d.buyer_address || '') +
          '<br>เลขประจำตัวผู้เสียภาษี <span class="small">Tax ID</span> <span class="mono">' + escHtml(d.buyer_tax_id || '—') + '</span>' +
          ' · ' + escHtml(cncBranchText(d.buyer_branch)) + ' <span class="small">' + escHtml(cncBranchText(d.buyer_branch, true)) + '</span>' +
          (d.buyer_phone ? '<br>โทร <span class="small">Tel</span> <span class="mono">' + escHtml(d.buyer_phone) + '</span>' : '') +
        '</div>' +
        '<div class="box"><div class="kv">' +
          '<span>เลขที่ <span class="small">No.</span></span><b class="mono">' + escHtml(d.number) + '</b>' +
          '<span>วันที่ <span class="small">Date</span></span><span class="mono">' + escHtml(self.dateTh(d.issue_date)) + '</span>' +
          (approvedLate ? '<span>วันที่อนุมัติการชำระ <span class="small">Payment approved</span></span><span class="mono">' + escHtml(self.dateTh(d.approved_date)) + '</span>' : '') +
          '<span>เลขที่คำขอเติมเครดิต <span class="small">Top-up No.</span></span><span class="mono">' + escHtml(d.topup_id || '—') + '</span>' +
          '<span>วิธีชำระเงิน <span class="small">Payment</span></span><span>' + escHtml(d.payment_method || '') + '</span>' +
        '</div></div>' +
      '</div>' +
      cnHtml +
      '<table class="items"><thead><tr>' +
        '<th style="width:9mm">#</th><th>รายการ <span class="small">Description</span></th>' +
        '<th class="num">จำนวน <span class="small">Qty</span></th><th class="num">ราคาต่อหน่วย <span class="small">Unit price</span></th>' +
        '<th class="num">จำนวนเงิน <span class="small">Amount</span></th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="sum">' +
        '<div class="words"><div class="small">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร) · Total in words</div><b>(' + escHtml(cncBahtText(d.total)) + ')</b></div>' +
        '<table>' +
          '<tr><td>' + (isCn ? 'มูลค่าที่ลดลง' : 'มูลค่าสินค้า') + ' <span class="small">' + (isCn ? 'Reduced value' : 'Value') + '</span></td><td class="num mono">' + self.money(d.subtotal) + '</td></tr>' +
          '<tr><td>ภาษีมูลค่าเพิ่ม <span class="mono">' + self.pct(d.vat_rate) + '%</span> <span class="small">VAT</span></td><td class="num mono">' + self.money(d.vat_amount) + '</td></tr>' +
          '<tr class="grand"><td>จำนวนเงินรวมทั้งสิ้น <span class="small">Total (THB)</span></td><td class="num mono">' + self.money(d.total) + '</td></tr>' +
        '</table>' +
      '</div>' +
      '<div class="sign"><div>ผู้รับเงิน / ผู้มีอำนาจลงนาม<br><span class="small">Authorized signature</span></div>' +
        '<div>ตราประทับบริษัท<br><span class="small">Company stamp</span></div></div>' +
      (copyKind === 'reference' ? '<div class="ref-note">' + escHtml(t('tax_ref_note')) + '</div>' : '') +
      '</section>';
  },

  // ----------------------------------------------------------------
  // 영수증 · 환불 영수증 (영어만, "tax invoice" 라는 말은 쓰지 않아요)
  // ----------------------------------------------------------------
  receiptHtml: function (d, ref) {
    var self = this;
    var isRf = d.doc_type === 'receipt_refund';
    var items = Array.isArray(d.items) ? d.items : [];
    var vatZero = Number(d.vat_rate || 0) === 0;
    var rows = items.map(function (it, i) {
      return '<tr><td class="mono">' + (i + 1) + '</td><td>' + escHtml(it.name_en || '') + '</td>' +
        '<td class="num mono">' + formatNumber(it.qty || 0) + '</td>' +
        '<td class="num mono">' + self.money(it.unit_price) + '</td>' +
        '<td class="num mono">' + self.money(it.amount) + '</td></tr>';
    }).join('');
    var country = d.buyer_country ? cncCountryName(d.buyer_country, 'en') : '';
    var rfHtml = isRf ? '<div class="box cn"><div class="kv">' +
      '<span>Original receipt</span><span class="mono">' + escHtml(ref ? ref.number : '—') + '</span>' +
      '<span>Original date</span><span class="mono">' + escHtml(ref ? self.dateEn(ref.issue_date) : '—') + '</span>' +
      '<span>Original amount (excl. VAT)</span><span class="mono">' + self.money(d.original_subtotal) + '</span>' +
      '<span>Amount after refund</span><span class="mono">' + self.money(d.correct_subtotal) + '</span>' +
      '<span>Refunded (excl. VAT)</span><span class="mono">' + self.money(d.subtotal) + '</span>' +
      '<span>Reason</span><span>' + escHtml(d.reason || '') + '</span></div></div>' : '';

    return '<section class="page" style="font-family:\'IBM Plex Sans\',sans-serif">' +
      '<div class="head">' +
        '<div><div class="logo">allAbut</div>' +
          '<div class="seller"><b>' + escHtml(d.seller_name_en || d.seller_name || '') + '</b><br>' + escHtml(d.seller_address_en || d.seller_address || '') +
            (d.seller_tax_id ? '<br>Tax ID <span class="mono">' + escHtml(d.seller_tax_id) + '</span>' : '') + '</div></div>' +
        '<div class="title"><h1>' + (isRf ? 'REFUND RECEIPT' : 'RECEIPT') + '</h1></div>' +
      '</div>' +
      '<div class="meta">' +
        '<div class="box"><h3>Received from</h3>' +
          '<b>' + escHtml(d.buyer_name || '') + '</b><br>' + escHtml(d.buyer_address || '') +
          (country ? '<br>' + escHtml(country) : '') +
          (d.buyer_tax_id ? '<br>Tax / VAT ID <span class="mono">' + escHtml(d.buyer_tax_id) + '</span>' : '') +
          (d.buyer_phone ? '<br>Tel <span class="mono">' + escHtml(d.buyer_phone) + '</span>' : '') +
        '</div>' +
        '<div class="box"><div class="kv">' +
          '<span>No.</span><b class="mono">' + escHtml(d.number) + '</b>' +
          '<span>Issue date</span><span class="mono">' + escHtml(self.dateEn(d.issue_date)) + '</span>' +
          '<span>Payment date</span><span class="mono">' + escHtml(self.dateEn(d.payment_date || d.approved_date)) + '</span>' +
          '<span>Top-up No.</span><span class="mono">' + escHtml(d.topup_id || '—') + '</span>' +
          '<span>Payment</span><span>' + escHtml(d.payment_method || '') + '</span>' +
        '</div></div>' +
      '</div>' +
      rfHtml +
      '<table class="items"><thead><tr><th style="width:9mm">#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '<div class="sum"><div></div><table>' +
        '<tr><td>' + (isRf ? 'Refund subtotal' : 'Subtotal') + '</td><td class="num mono">' + self.money(d.subtotal) + '</td></tr>' +
        '<tr><td>VAT <span class="mono">' + (vatZero ? '0' : self.pct(d.vat_rate)) + '%</span></td><td class="num mono">' + self.money(d.vat_amount) + '</td></tr>' +
        '<tr class="grand"><td>' + (isRf ? 'Total refunded (THB)' : 'Total (THB)') + '</td><td class="num mono">' + self.money(d.total) + '</td></tr>' +
      '</table></div>' +
      '<p class="foot">This receipt is not a Thai tax invoice.</p>' +
      '</section>';
  },

  // ----------------------------------------------------------------
  // 여러 장 HTML (mode 에 따라 원본 · 사본 · 확인용)
  // refs: { id: doc } — 크레딧 노트 · 환불 영수증이 가리키는 원래 문서
  // ----------------------------------------------------------------
  pagesHtml: function (docs, mode, refs) {
    var self = this;
    refs = refs || {};
    var html = '';
    (docs || []).forEach(function (d) {
      var ref = d.ref_invoice_id ? refs[d.ref_invoice_id] : null;
      if (!cncTaxDocIsThai(d)) { html += self.receiptHtml(d, ref); return; }
      if (mode === 'reference') html += self.thaiDocHtml(d, 'reference', ref);
      else if (mode === 'copy') html += self.thaiDocHtml(d, 'copy', ref);
      else if (mode === 'both') html += self.thaiDocHtml(d, 'original', ref) + self.thaiDocHtml(d, 'copy', ref);
      else html += self.thaiDocHtml(d, 'original', ref);
    });
    return html;
  },

  fullHtml: function (title, body, note) {
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escHtml(title) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + this.css() + '</style></head><body>' +
      '<div class="toolbar"><button type="button" onclick="window.print()">🖨 ' + escHtml(t('tax_print_now')) + '</button>' +
        (note ? '<span class="tb-note">' + escHtml(note) + '</span>' : '') + '</div>' +
      body + '</body></html>';
  },

  // 새 창에 쓰기 (팝업이 막히면 안내)
  writeWindow: function (html) {
    var w = window.open('', '_blank');
    if (!w) { uiToast(t('tax_popup_blocked'), 'error'); return null; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    return w;
  },

  // 크레딧 노트 · 환불 영수증이 가리키는 원래 문서를 읽어 와요 (목록에 없으면)
  loadRefs: async function (docs) {
    var refs = {};
    (docs || []).forEach(function (d) { refs[d.id] = d; });
    var need = (docs || []).map(function (d) { return d.ref_invoice_id; })
      .filter(function (id, i, arr) { return id && !refs[id] && arr.indexOf(id) === i; });
    if (need.length) {
      try {
        var r = await sb.from('tax_invoices').select('*').in('id', need);
        (r.data || []).forEach(function (d) { refs[d.id] = d; });
      } catch (e) { /* 원래 번호 없이도 출력돼요 */ }
    }
    return refs;
  },

  open: async function (docs, opts) {
    opts = opts || {};
    docs = (docs || []).filter(Boolean);
    if (!docs.length) return null;
    var w = window.open('', '_blank');   // 클릭 바로 다음에 열어야 팝업이 안 막혀요
    if (!w) { uiToast(t('tax_popup_blocked'), 'error'); return null; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">…</p>');
    var refs = await this.loadRefs(docs);
    var mode = opts.mode || 'original';
    var note = mode === 'reference' && docs.some(cncTaxDocIsThai) ? t('tax_ref_note') : '';
    var title = docs.length === 1 ? docs[0].number : (docs[0].number + ' … ' + docs[docs.length - 1].number);
    var html = this.fullHtml(title, this.pagesHtml(docs, mode, refs), note);
    w.document.open();
    w.document.write(html);
    w.document.close();
    return w;
  },

  // ----------------------------------------------------------------
  // 주소 라벨 (같은 고객 + 같은 달 = 한 봉투)
  //   kind 'sheet'    A4 라벨지 한 장에 8칸 (2 × 4)
  //   kind 'envelope' 창봉투용 — 봉투 한 장마다 A4 한 장 (주소가 창 위치에 와요)
  // ----------------------------------------------------------------
  labelHtml: function (g) {
    return '<b>' + escHtml(g.name || '') + '</b><br>' + escHtml(g.address || '').replace(/\n/g, '<br>') +
      (g.phone ? '<br>โทร <span class="mono">' + escHtml(g.phone) + '</span>' : '') +
      '<br><span class="small mono">' + g.docs.map(function (d) { return escHtml(d.number); }).join(', ') + '</span>';
  },

  labels: function (groups, kind) {
    var self = this;
    groups = groups || [];
    if (!groups.length) return null;
    var body = '';
    if (kind === 'envelope') {
      body = groups.map(function (g) { return '<section class="page"><div class="envelope">' + self.labelHtml(g) + '</div></section>'; }).join('');
    } else {
      for (var i = 0; i < groups.length; i += 8) {
        body += '<section class="page" style="padding:0"><div class="label-sheet">' +
          groups.slice(i, i + 8).map(function (g) { return '<div class="label">' + self.labelHtml(g) + '</div>'; }).join('') +
          '</div></section>';
      }
    }
    return this.writeWindow(this.fullHtml(t('tax_labels_title'), body, ''));
  }
};
