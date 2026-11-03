// ===== 법적 문서 페이지 #/terms · #/privacy · #/credit-policy =====
// 로그인 없이도 볼 수 있어요 (로그인 전: 별도 화면 screen-legal, 로그인 후: 앱 화면 안).
// - 위: 제목, 버전·시행일, "영어본 우선" 안내 (영어 본문만 있는 언어는 추가 안내)
// - 왼쪽(PC) / 위(모바일): 목차, 본문은 섹션 번호
// - 맨 아래: 연락처 (company_settings)
// - 회사 정보·가격은 DB 에서 읽어서 자동으로 넣어요. 비어 있으면 "[Company name]" 같은 자리표시
// - "초안 · 법률 검토 필요" 표시는 관리자에게만

var PageLegal = {
  main: null,
  route: null,
  state: null,   // { doc, data, lang, englishOnly, company, versions, packages, payment, error }
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.route = window.currentRoute || parseRoute(location.hash);
    this.state = null;
    this.draw();
    this.load();
  },

  rerender: function () {
    this.state = null;
    this.draw();
    this.load();
  },

  leave: function () {
    this.loadToken++;
  },

  load: async function () {
    var token = ++this.loadToken;
    var info = legalDocForRoute(this.route) || LEGAL_DOCS_LIST[0];
    var st = { doc: info, error: null };
    try {
      var res = await Promise.all([
        cncGetLegalDoc(info.doc, currentLang),
        cncGetCompany().catch(function () { return {}; }),
        cncGetLegalVersions().catch(function () { return {}; }),
        info.doc === 'credit' ? sb.from('credit_packages').select('*').eq('active', true).order('credits', { ascending: true }).then(function (r) { return r.data || []; }, function () { return []; }) : Promise.resolve([]),
        info.doc === 'credit' ? sb.from('payment_settings').select('vat_rate').eq('id', 1).maybeSingle().then(function (r) { return r.data || null; }, function () { return null; }) : Promise.resolve(null)
      ]);
      if (token !== this.loadToken) return;
      st.data = res[0].data;
      st.lang = res[0].lang;
      st.englishOnly = res[0].englishOnly;
      st.company = res[1] || {};
      st.versions = res[2] || {};
      st.packages = res[3] || [];
      st.vat = res[4] && res[4].vat_rate != null ? Number(res[4].vat_rate) : 7;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      st.error = err;
    }
    this.state = st;
    this.draw();
  },

  // ----- 자리표시 바꾸기 (글자는 먼저 escHtml, 값도 escHtml) -----
  values: function () {
    var c = (this.state && this.state.company) || {};
    var single = this.singlePrice();
    function v(val, ph) { return val ? escHtml(val) : '<span class="legal-ph">[' + escHtml(ph) + ']</span>'; }
    return {
      company_name: v(c.company_name, 'Company name'),
      company_address: v(c.address, 'Company address'),
      tax_id: v(c.tax_id, 'Tax ID'),
      email: v(c.email, 'Contact email'),
      dpo_email: v(c.dpo_email || c.email, 'Privacy contact email'),
      phone: v(c.phone, 'Phone'),
      line_id: v(c.line_id, 'LINE ID'),
      vat: escHtml(formatNumber(this.state ? this.state.vat : 7)),
      single_price: single ? escHtml(formatTHB(single)) : '<span class="legal-ph">[1-credit price]</span>'
    };
  },

  fill: function (text) {
    var vals = this.values();
    return escHtml(text).replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(vals, name) ? vals[name] : all;
    });
  },

  singlePrice: function () {
    var pk = ((this.state && this.state.packages) || []).filter(function (p) { return Number(p.credits) === 1; })[0];
    return pk ? Number(pk.unit_price) : 0;
  },

  // 가격표 (판매 중인 패키지)
  priceTableHtml: function () {
    var st = this.state;
    var vat = st.vat;
    if (!st.packages.length) return '<p class="legal-ph">[' + escHtml(t('legal_prices_unavailable')) + ']</p>';
    return '<div class="table-wrap legal-table"><table class="table"><thead><tr>' +
      '<th>' + escHtml(t('admin_pkg_credits')) + '</th><th>' + escHtml(t('topup_each_label')) + '</th>' +
      '<th>' + escHtml(t('topup_subtotal')) + '</th><th>' + escHtml(tf('topup_vat', { n: formatNumber(vat) })) + '</th><th>' + escHtml(t('topup_total')) + '</th></tr></thead><tbody>' +
      st.packages.map(function (p) {
        var price = cncPackagePrice(p, vat);
        return '<tr><td class="mono">' + formatNumber(p.credits) + '</td><td class="mono">' + formatTHB(p.unit_price) + '</td>' +
          '<td class="mono">' + formatTHB(price.subtotal) + '</td><td class="mono">' + formatTHB(price.vat) + '</td><td class="mono"><b>' + formatTHB(price.total) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  // 환불 계산 예시: 1개보다 큰 가장 작은 패키지에서 3개를 쓴 경우
  refundExampleHtml: function () {
    var st = this.state;
    var vat = st.vat;
    var single = this.singlePrice();
    var pk = st.packages.filter(function (p) { return Number(p.credits) >= 5; })[0];
    if (!pk || !single) return '<p class="legal-ph">[' + escHtml(t('legal_prices_unavailable')) + ']</p>';
    var used = 3;
    var paid = cncPackagePrice(pk, vat).total;
    var charge = Math.round(used * single * (1 + vat / 100) * 100) / 100;
    var refund = Math.max(0, Math.round((paid - charge) * 100) / 100);
    return '<div class="legal-example">' +
      '<p>' + escHtml(tf('legal_ex_bought', { n: formatNumber(pk.credits), price: formatTHB(pk.unit_price), paid: formatTHB(paid) })) + '</p>' +
      '<p>' + escHtml(tf('legal_ex_used', { n: used })) + '</p>' +
      '<p>' + escHtml(tf('legal_ex_charge', { n: used, single: formatTHB(single), vat: formatNumber(vat), charge: formatTHB(charge) })) + '</p>' +
      '<p class="legal-ex-result">' + escHtml(tf('legal_ex_refund', { paid: formatTHB(paid), charge: formatTHB(charge), refund: formatTHB(refund) })) + '</p>' +
      '</div>';
  },

  bodyItemHtml: function (item) {
    var self = this;
    if (Array.isArray(item)) return '<ul>' + item.map(function (li) { return '<li>' + self.fill(li) + '</li>'; }).join('') + '</ul>';
    if (item === '{{PRICE_TABLE}}') return this.priceTableHtml();
    if (item === '{{REFUND_EXAMPLE}}') return this.refundExampleHtml();
    return '<p>' + this.fill(item) + '</p>';
  },

  // 연락처 (company_settings)
  contactHtml: function () {
    var vals = this.values();
    function row(key, value) {
      return '<div class="legal-contact-row"><span class="legal-contact-label">' + escHtml(t(key)) + '</span><span>' + value + '</span></div>';
    }
    return row('legal_company', vals.company_name) +
      row('address_label', vals.company_address) +
      row('tax_id_label', vals.tax_id) +
      row('email_label', vals.email) +
      row('legal_dpo_email', vals.dpo_email) +
      row('phone_label', vals.phone) +
      row('line_id_label', vals.line_id);
  },

  draw: function () {
    if (!this.main) return;
    var self = this;
    var st = this.state;
    var info = legalDocForRoute(this.route) || LEGAL_DOCS_LIST[0];

    // 다른 문서로 가는 탭
    var tabs = '<nav class="legal-tabs" aria-label="' + escHtml(t('legal_documents')) + '">' + LEGAL_DOCS_LIST.map(function (d) {
      var on = d.doc === info.doc;
      return '<a href="#/' + d.route + '" class="legal-tab' + (on ? ' active' : '') + '"' + (on ? ' aria-current="page"' : '') + '>' + escHtml(t(d.titleKey)) + '</a>';
    }).join('') + '</nav>';

    if (!st) {
      this.main.innerHTML = '<div class="page page-legal">' + tabs + '<div class="card">' + uiLoading() + '</div></div>';
      return;
    }
    if (st.error || !st.data) {
      this.main.innerHTML = '<div class="page page-legal">' + tabs + '<div class="card"><p class="error-text">' + escHtml(t('load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageLegal.rerender()">' + escHtml(t('btn_retry')) + '</button></div></div>';
      return;
    }

    var data = st.data;
    var ver = st.versions[info.doc] || {};
    var sections = data.sections.map(function (sec, i) {
      return { id: 'legal-s' + (i + 1), title: sec.title, body: sec.body };
    });

    var html = '<div class="page page-legal">' + tabs +
      '<div class="legal-layout">' +
        '<nav class="legal-toc card" aria-label="' + escHtml(t('guide_toc')) + '"><p class="legal-toc-title">' + escHtml(t('guide_toc')) + '</p><ol>' +
          sections.map(function (s, i) {
            return '<li><a href="#/' + info.route + '" data-target="' + s.id + '" onclick="return PageLegal.jump(event)"><span class="mono">' + (i + 1) + '.</span> ' + escHtml(s.title) + '</a></li>';
          }).join('') +
          '<li><a href="#/' + info.route + '" data-target="legal-contact" onclick="return PageLegal.jump(event)"><span class="mono">' + (sections.length + 1) + '.</span> ' + escHtml(t('legal_contact')) + '</a></li>' +
        '</ol></nav>' +
        '<article class="legal-doc card" lang="' + escHtml(st.lang) + '" dir="' + (st.lang === 'en' ? 'ltr' : 'auto') + '">' +
          (window.APP && APP.isAdmin ? '<p class="legal-draft no-print"><span aria-hidden="true">⚠</span> ' + escHtml(t('legal_draft_admin')) + '</p>' : '') +
          '<h1 class="legal-title">' + escHtml(data.title) + '</h1>' +
          '<p class="legal-meta">' + escHtml(t('legal_version')) + ' <span class="mono">' + escHtml(ver.version || '—') + '</span> · ' +
            escHtml(t('legal_effective')) + ' ' + escHtml(ver.effective_date ? formatDate(ver.effective_date) : '—') + '</p>' +
          '<div class="legal-notice">' +
            (st.englishOnly ? '<p>' + escHtml(t('legal_english_only')) + '</p>' : '') +
            '<p>' + escHtml(t('legal_prevails')) + '</p>' +
          '</div>' +
          '<p class="legal-intro">' + this.fill(data.intro || '') + '</p>' +
          sections.map(function (s, i) {
            return '<section class="legal-section" id="' + s.id + '"><h2><span class="mono">' + (i + 1) + '.</span> ' + escHtml(s.title) + '</h2>' +
              s.body.map(function (item) { return self.bodyItemHtml(item); }).join('') + '</section>';
          }).join('') +
          '<section class="legal-section legal-contact" id="legal-contact"><h2><span class="mono">' + (sections.length + 1) + '.</span> ' + escHtml(t('legal_contact')) + '</h2>' +
            this.contactHtml() + '</section>' +
          '<div class="legal-actions no-print">' +
            '<button type="button" class="btn btn-outline" onclick="window.print()">🖨 ' + escHtml(t('legal_print')) + '</button>' +
          '</div>' +
        '</article>' +
      '</div></div>';
    this.main.innerHTML = html;
  },

  // 목차 → 섹션으로 스크롤 (주소의 # 는 페이지 이동에 쓰여서 스크롤로 처리)
  jump: function (event) {
    event.preventDefault();
    var id = event.currentTarget.getAttribute('data-target');
    var el = document.getElementById(id);
    if (el) {
      var y = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      var h = el.querySelector('h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    return false;
  }
};
