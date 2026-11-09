// ===== 회사소개 #/about =====
// 로그인 없이도 볼 수 있어요 (로그인 전에는 법적 문서·문의하기와 같은 screen-legal 화면에 그려요).
// 문구는 전부 번역 키 (about_...), 회사마다 다른 값은 company_settings 에서만 읽어요 (sql/007):
//   founded_year · implant_brands · lead_time · delivery · remake_policy (+ 주소·이메일·LINE 은 cncContactInfo)
// 값이 비어 있는 줄·카드·섹션은 숨겨요.
//
// 순서: Hero(다크) → 01 About → 02 Why allAbut(강점 5개) → 03 Products → 04 How to order → 05 Delivery & guarantee → 06 Contact
// SEO: 이 페이지가 열려 있는 동안 title · description · og 태그(언어별) + 회사 정보 JSON-LD(Organization)를 넣고, 나가면 원래대로.

// 제품 카드 — 나중에 사진을 넣으려면 img 에 경로를 쓰고(예: 'img/abutment.jpg'), 그 폴더를 build.sh 목록에도 추가하세요.
// img 가 비어 있으면 사진 자리는 아예 그리지 않아요.
var ABOUT_PRODUCTS = [
  { id: 'abutment', titleKey: 'about_prod1_title', textKey: 'about_prod1_text', img: '' },
  { id: 'crown-set', titleKey: 'about_prod2_title', textKey: 'about_prod2_text', img: '' }
];

// 강점 카드 5개 (아이콘은 아래 ABOUT_ICONS)
var ABOUT_STRENGTHS = [
  { icon: 'precision', titleKey: 'about_why1_title', textKey: 'about_why1_text' },
  { icon: 'metrology', titleKey: 'about_why2_title', textKey: 'about_why2_text' },
  { icon: 'titanium', titleKey: 'about_why3_title', textKey: 'about_why3_text' },
  { icon: 'design', titleKey: 'about_why4_title', textKey: 'about_why4_text' },
  { icon: 'certified', titleKey: 'about_why5_title', textKey: 'about_why5_text', chips: ['ISO 13485', 'Thai FDA', 'GMP'] }
];

// 숫자·규격 글자 → IBM Plex Mono 골드 (번역문 안에서도 이 글자 그대로 찾아요)
var ABOUT_SPEC_TOKENS = ['Ti-6Al-4V ELI', 'ASTM F136', 'Grade 23', 'ISO 13485', '5μm'];

// 선 아이콘 (stroke 만, 색은 CSS 의 currentColor = 골드)
var ABOUT_ICONS = {
  // 십자선 + 원: 정밀 가공
  precision: '<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="4"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/>',
  // 버니어 캘리퍼스: 측정
  metrology: '<path d="M6 14h36v8H6z"/><path d="M12 22v18l5-6V22M30 22v12l5 6V22"/><path d="M14 14v-4M20 14v-3M26 14v-4M32 14v-3M38 14v-4"/>',
  // 육각 막대 단면: 티타늄 소재
  titanium: '<path d="M24 5l16 9v20l-16 9-16-9V14z"/><path d="M8 14l16 9 16-9M24 23v20"/>',
  // 펜 + 치아 윤곽: 디자인
  design: '<path d="M14 8c-5 0-8 4-8 9 0 6 3 9 4 14 1 4 2 9 5 9s3-7 5-7 2 7 5 7 4-5 5-9"/><path d="M30 30L42 18l-4-4-12 12-2 6z"/>',
  // 방패 + 체크: 인증
  certified: '<path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z"/><path d="M16 24l6 6 11-12"/>'
};

var PageAbout = {
  main: null,
  loadToken: 0,
  observer: null,
  savedMeta: null,

  render: function (main) {
    this.main = main;
    this.draw();
    this.load();
  },

  rerender: function (main) {
    if (main) this.main = main;
    this.draw();
  },

  leave: function () {
    this.loadToken++;
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    this.restoreMeta();
  },

  // 회사 정보 새로 읽기 (관리자가 방금 바꿨을 수도 있어서 항상 새로)
  load: async function () {
    var token = ++this.loadToken;
    try {
      await cncGetCompany(true);
    } catch (err) {
      console.warn('company settings load failed', err);
    }
    if (token !== this.loadToken) return;
    this.draw();
    renderFooters();
  },

  // ----------------------------------------------------------------
  // 작은 도우미
  // ----------------------------------------------------------------
  // 번역문을 안전하게 바꾼 뒤, 규격 글자만 Mono 골드로 감싸요
  specHtml: function (text) {
    var html = escHtml(text);
    ABOUT_SPEC_TOKENS.forEach(function (tok) {
      var safe = escHtml(tok);
      html = html.split(safe).join('<span class="mono about-spec">' + safe + '</span>');
    });
    return html;
  },

  icon: function (name) {
    return '<svg class="about-icon" viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ABOUT_ICONS[name] || '') + '</svg>';
  },

  // 섹션 머리: "01" (Mono 골드) + 얇은 골드 선 + 제목
  sectionHead: function (num, titleKey) {
    return '<div class="about-sec-head">' +
      '<span class="about-sec-num mono" aria-hidden="true">' + num + '</span>' +
      '<span class="about-sec-rule" aria-hidden="true"></span>' +
      '<h2 class="about-sec-title">' + escHtml(t(titleKey)) + '</h2>' +
    '</div>';
  },

  // Hero 의 치수선 장식: |<—— 5μm ——>|
  dimensionSvg: function () {
    return '<svg class="about-dim" viewBox="0 0 320 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<path d="M1 4v20M319 4v20" />' +
      '<path d="M8 14h126M186 14h126" />' +
      '<path d="M8 14l8-4M8 14l8 4M312 14l-8-4M312 14l-8 4" />' +
      '<text x="160" y="18.5" text-anchor="middle">5 μm</text>' +
    '</svg>';
  },

  // ----------------------------------------------------------------
  // 그리기
  // ----------------------------------------------------------------
  draw: function () {
    if (!this.main) return;
    var self = this;
    var p = cncCompanyProfile(currentLang);
    var c = cncContactInfo();
    var num = 0;
    var next = function () { num++; return (num < 10 ? '0' : '') + num; };

    // ===== Hero (다크) =====
    var hero =
      '<section class="about-hero" aria-labelledby="about-hero-title">' +
        '<div class="about-hero-inner">' +
          '<div class="logo about-logo" aria-label="allAbut 5μm">' +
            '<span class="logo-all">all</span><span class="logo-a">A</span><span class="logo-but">but</span><span class="logo-um">5μm</span>' +
          '</div>' +
          '<h1 class="about-hero-title" id="about-hero-title">' + escHtml(t('about_hero_title')) +
            ' <span class="mono about-hero-um">5μm.</span></h1>' +
          this.dimensionSvg() +
          '<p class="about-hero-sub">' + escHtml(t('about_hero_sub')) + '</p>' +
          '<div class="about-hero-actions">' +
            '<button type="button" class="btn btn-gold btn-lg about-cta-order" onclick="PageAbout.startOrder()">' + escHtml(t('about_cta_order')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
            '<a href="#/contact" class="btn btn-lg about-btn-ghost">' + escHtml(t('about_cta_contact')) + '</a>' +
          '</div>' +
        '</div>' +
      '</section>';

    // ===== 01 About =====
    var yearMark = '\u0000';
    var intro = escHtml(tf('about_intro', { year: yearMark })).split(yearMark)
      .join('<span class="mono about-num">' + escHtml(String(p.foundedYear)) + '</span>');
    var about =
      '<section class="about-section about-reveal" id="about-company">' +
        this.sectionHead(next(), 'about_sec_about') +
        '<div class="about-intro">' +
          '<p class="about-lead">' + intro + '</p>' +
          '<dl class="about-stats">' +
            '<div class="about-stat"><dt class="mono">20<span class="about-stat-plus">+</span></dt><dd>' + escHtml(t('about_stat_years')) + '</dd></div>' +
            '<div class="about-stat"><dt class="mono">5μm</dt><dd>' + escHtml(t('about_stat_precision')) + '</dd></div>' +
            '<div class="about-stat"><dt class="mono">Grade 23</dt><dd>' + escHtml(t('about_stat_material')) + '</dd></div>' +
          '</dl>' +
        '</div>' +
      '</section>';

    // ===== 02 Why allAbut =====
    var why =
      '<section class="about-section about-reveal" id="about-why">' +
        this.sectionHead(next(), 'about_sec_why') +
        '<div class="about-why-grid">' +
          ABOUT_STRENGTHS.map(function (s, i) {
            return '<article class="about-why-card">' +
              '<div class="about-why-top">' + self.icon(s.icon) + '<span class="about-why-idx mono" aria-hidden="true">' + (i + 1) + '/5</span></div>' +
              '<h3 class="about-why-title">' + self.specHtml(t(s.titleKey)) + '</h3>' +
              '<p class="about-why-text">' + self.specHtml(t(s.textKey)) + '</p>' +
              (s.chips ? '<ul class="about-cert-chips">' + s.chips.map(function (ch) {
                return '<li class="about-cert-chip"><span class="about-cert-dot" aria-hidden="true"></span>' + self.specHtml(ch) + '</li>';
              }).join('') + '</ul>' : '') +
            '</article>';
          }).join('') +
        '</div>' +
      '</section>';

    // ===== 03 Products =====
    var products =
      '<section class="about-section about-reveal" id="about-products">' +
        this.sectionHead(next(), 'about_sec_products') +
        '<div class="about-products">' +
          ABOUT_PRODUCTS.map(function (pr) {
            return '<article class="about-product" data-product="' + escHtml(pr.id) + '">' +
              (pr.img ? '<div class="about-product-img"><img src="' + escHtml(pr.img) + '" alt="' + escHtml(t(pr.titleKey)) + '" loading="lazy"></div>' : '') +
              '<div class="about-product-body">' +
                '<h3 class="about-product-title">' + escHtml(t(pr.titleKey)) + '</h3>' +
                '<p class="about-product-text">' + self.specHtml(t(pr.textKey)) + '</p>' +
              '</div>' +
            '</article>';
          }).join('') +
        '</div>' +
        '<p class="about-note">' + escHtml(t('about_prod_note')) + '</p>' +
        (p.brands.length ?
          '<div class="about-brands" id="about-brands">' +
            '<h3 class="about-sub-title">' + escHtml(t('about_compatible')) + '</h3>' +
            '<ul class="about-brand-chips">' + p.brands.map(function (b) {
              return '<li class="about-brand-chip">' + escHtml(b) + '</li>';
            }).join('') + '</ul>' +
          '</div>' : '') +
      '</section>';

    // ===== 04 How to order (새 주문 5단계와 같은 이름) =====
    var how =
      '<section class="about-section about-reveal" id="about-how">' +
        this.sectionHead(next(), 'about_sec_how') +
        '<ol class="about-steps">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<li class="about-step">' +
              '<span class="about-step-num mono" aria-hidden="true">' + n + '</span>' +
              '<span class="about-step-label">' + escHtml(t('wiz_step' + n)) + '</span>' +
            '</li>';
          }).join('') +
        '</ol>' +
        '<p class="about-how-note">' + escHtml(t('about_how_note')) + '</p>' +
      '</section>';

    // ===== 05 Delivery & guarantee (값이 있는 줄만, 하나도 없으면 섹션째 숨김) =====
    var rows = [
      { key: 'about_lead_time', value: p.leadTime, id: 'lead' },
      { key: 'about_delivery', value: p.delivery, id: 'delivery' },
      { key: 'about_remake', value: p.remakePolicy, id: 'remake' }
    ].filter(function (r) { return r.value; });
    var delivery = rows.length ?
      '<section class="about-section about-reveal" id="about-delivery">' +
        this.sectionHead(next(), 'about_sec_delivery') +
        '<dl class="about-terms">' + rows.map(function (r) {
          return '<div class="about-term" data-term="' + r.id + '"><dt>' + escHtml(t(r.key)) + '</dt><dd class="pre">' + escHtml(r.value) + '</dd></div>';
        }).join('') + '</dl>' +
      '</section>' : '';

    // ===== 06 Contact =====
    var contactBits = [];
    if (c.address) contactBits.push('<span class="about-contact-item about-contact-address">' + escHtml(c.address).replace(/\n/g, ', ') + '</span>');
    if (c.email) contactBits.push('<a class="about-contact-item" href="' + escHtml(cncMailto(c.email)) + '">' + escHtml(c.email) + '</a>');
    contactBits.push('<a class="about-contact-item" href="' + escHtml(c.lineUrl) + '" target="_blank" rel="noopener">LINE ' + escHtml(c.lineId) + '</a>');
    var contact =
      '<section class="about-section about-reveal about-contact" id="about-contact">' +
        this.sectionHead(next(), 'about_sec_contact') +
        '<div class="about-contact-box">' +
          '<div>' +
            (c.company ? '<p class="about-contact-company">' + escHtml(c.company) + '</p>' : '') +
            '<p class="about-contact-text">' + escHtml(t('about_contact_text')) + '</p>' +
            '<p class="about-contact-line">' + contactBits.join('<span class="about-dot" aria-hidden="true">·</span>') + '</p>' +
          '</div>' +
          '<a href="#/contact" class="btn btn-primary btn-lg about-contact-btn">' + escHtml(t('about_cta_contact')) + '</a>' +
        '</div>' +
      '</section>';

    this.main.innerHTML = '<div class="page page-about">' + hero + '<div class="about-body">' + about + why + products + how + delivery + contact + '</div></div>';
    this.applyMeta(p, c);
    this.setupReveal();
  },

  // "Start an order": 로그인했으면 새 주문, 아니면 로그인 화면
  startOrder: function () {
    if (window.APP && APP.user) {
      location.hash = '#/new';
      return;
    }
    if (typeof leaveLegalPage === 'function') leaveLegalPage(null, true);
  },

  // ----------------------------------------------------------------
  // 스크롤할 때 섹션이 살짝 나타나기 (움직임 줄이기 설정이면 끔)
  // ----------------------------------------------------------------
  setupReveal: function () {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    var page = this.main && this.main.querySelector('.page-about');
    if (!page) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;   // 애니메이션 없이 바로 보여요
    var items = page.querySelectorAll('.about-reveal');
    page.classList.add('about-animate');
    this.observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    for (var i = 0; i < items.length; i++) this.observer.observe(items[i]);
  },

  // ----------------------------------------------------------------
  // SEO: title · description · og 태그 (언어별) + JSON-LD (Organization)
  // ----------------------------------------------------------------
  metaEl: function (attr, name) {
    var el = document.head.querySelector('meta[' + attr + '="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      el.setAttribute('data-about-added', '1');
      document.head.appendChild(el);
    }
    return el;
  },

  applyMeta: function (p, c) {
    var self = this;
    var title = t('about_meta_title');
    var desc = t('about_meta_desc');
    var url = (typeof SITE_URL === 'string' ? SITE_URL : '') + '/#/about';
    var tags = [
      ['name', 'description', desc],
      ['property', 'og:title', title],
      ['property', 'og:description', desc],
      ['property', 'og:type', 'website'],
      ['property', 'og:url', url],
      ['property', 'og:site_name', 'allAbut'],
      ['property', 'og:locale', currentLang]
    ];
    if (!this.savedMeta) {
      this.savedMeta = { title: document.title, tags: tags.map(function (tg) {
        var el = document.head.querySelector('meta[' + tg[0] + '="' + tg[1] + '"]');
        return { attr: tg[0], name: tg[1], content: el ? el.getAttribute('content') : null };
      }) };
    }
    document.title = title;
    tags.forEach(function (tg) { self.metaEl(tg[0], tg[1]).setAttribute('content', tg[2]); });

    // 회사 정보 JSON-LD (값은 textContent 로 넣어서 HTML 로 해석되지 않아요)
    var org = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: c.company || 'allAbut',
      alternateName: 'allAbut',
      url: (typeof SITE_URL === 'string' ? SITE_URL : ''),
      description: desc,
      foundingDate: String(p.foundedYear),
      foundingLocation: 'Bangkok, Thailand',
      areaServed: 'TH',
      knowsLanguage: (typeof LANGUAGES !== 'undefined' ? LANGUAGES.map(function (l) { return l.code; }) : undefined),
      sameAs: [c.lineUrl]
    };
    if (c.address) org.address = { '@type': 'PostalAddress', streetAddress: c.address.replace(/\n/g, ', '), addressCountry: 'TH' };
    if (c.email) org.email = c.email;
    if (c.phone) org.telephone = c.phone;
    if (c.email || c.phone) {
      org.contactPoint = [{ '@type': 'ContactPoint', contactType: 'customer support', email: c.email || undefined, telephone: c.phone || undefined }];
    }
    var ld = document.getElementById('about-jsonld');
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'about-jsonld';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(org).replace(/</g, '\\u003c');
  },

  // 페이지를 떠나면 원래 태그로
  restoreMeta: function () {
    var ld = document.getElementById('about-jsonld');
    if (ld) ld.remove();
    if (!this.savedMeta) return;
    this.savedMeta.tags.forEach(function (tg) {
      var el = document.head.querySelector('meta[' + tg.attr + '="' + tg.name + '"]');
      if (!el) return;
      if (tg.content == null) el.remove();
      else el.setAttribute('content', tg.content);
    });
    this.savedMeta = null;
  }
};
