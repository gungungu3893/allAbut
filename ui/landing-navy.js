// ===== 네이비 스플릿 랜딩 본문 (config.js 의 SITE_THEME = 'navy' 일 때만) =====
// classic · mono 이면 아무것도 하지 않아요 (ui/landing-mono.js 와 같은 방식).
// navy 이면:
//   - 랜딩 메뉴 줄에 "가격"(#/credit-policy) 링크를 회사소개 다음에 넣어요
//   - 본문 두 덩어리를 넣어요 (그 사이에 방문자 숫자 · Beta · 이벤트 배너 · 광고 자리 — 순서는 css/theme-navy.css 의 order)
//       <div class="navy-hero">  (1) 반으로 나눈 Hero: 왼쪽 네이비(작은 줄 · 큰 제목 · 설명 · [Start an order] [How it works]) /
//                                    오른쪽 옅은 면(config.js LANDING_IMAGE 사진, 없으면 흰 카드 3장: 소재 · 공차 · 제조사(company_settings, 비면 숨김))
//       <div class="navy-rest">  (2) Why allAbut — 카드 4장(about_why1~4 재사용)  (3) How it works — 주문 5단계(wiz_step1~5) + 네이비 면 안내
//                                (4) 가격 — 판매 중인 어버트먼트 패키지 카드 (못 읽으면 구역 전체 숨김)  (5) 마지막 띠 — [Create account] [Chat on LINE]
// 숫자 · 규격 글자만 Mono 글꼴, 사용자 · 설정 값은 escHtml. 화면 모양은 css/theme-navy.css (html[data-site-theme="navy"] 아래)

var LANDING_NAVY_SPECS = ['<5μm', 'Ti-6Al-4V ELI', 'ASTM F136', 'Grade 23', 'ISO 13485'];

var LandingNavy = {
  hero: null,
  rest: null,
  packages: null,     // 판매 중인 어버트먼트 패키지 [{ credits, unit_price }] (작은 것부터), 못 읽으면 null
  vat: 7,             // VAT % (결제 설정은 로그인 전에 못 읽어서 기본 7 — 법적 문서 가격표와 같은 규칙)

  init: function () {
    if (!(window.cncIsNavy && cncIsNavy())) return;
    var land = document.getElementById('screen-landing');
    if (!land || this.hero) return;

    // 1) 메뉴 줄: 로고 · 회사소개 · **가격** · 언어 · 로그인
    var about = land.querySelector('.landing-nav-right .landing-nav-link');
    if (about && !land.querySelector('.landing-nav-pricing')) {
      var a = document.createElement('a');
      a.href = '#/credit-policy';
      a.className = 'landing-nav-link landing-nav-pricing';
      a.setAttribute('data-i18n', 'navy_nav_pricing');
      a.textContent = t('navy_nav_pricing');
      about.parentNode.insertBefore(a, about.nextSibling);
    }

    // 2) 본문 두 덩어리
    var hero = document.createElement('div');
    hero.className = 'navy-hero';
    hero.id = 'navy-hero';
    var rest = document.createElement('div');
    rest.className = 'navy-rest';
    rest.id = 'navy-rest';
    var nav = land.querySelector('.landing-nav');
    land.insertBefore(hero, nav ? nav.nextSibling : land.firstChild);
    land.appendChild(rest);
    this.hero = hero;
    this.rest = rest;
    this.render();
    this.loadData();
    window.addEventListener('langchange', function () { LandingNavy.render(); });
  },

  // 번역문을 안전하게(escHtml) 바꾼 뒤 규격 글자만 Mono 로 ("<" 는 &lt;, 아랍어 · 페르시아어에서도 안 뒤집히게 dir="ltr")
  specHtml: function (text) {
    var html = escHtml(text);
    var toks = LANDING_NAVY_SPECS.map(escHtml).sort(function (x, y) { return y.length - x.length; });
    var re = new RegExp(toks.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');
    return html.replace(re, function (m) { return '<span class="mono" dir="ltr">' + m + '</span>'; });
  },

  // 회사소개 강점 문구의 {manufacturer} = 제조사 이름 (비면 "제조 협력사")
  mfrName: function () {
    var m = typeof cncManufacturerInfo === 'function' ? cncManufacturerInfo() : { name: '' };
    return m.name || t('about_mfr_partner');
  },

  // "Create account" → 로그인 화면의 회원가입 탭
  signup: function () {
    if (typeof resetAuthForms === 'function') resetAuthForms();
    switchTab('signup');
    showScreen('auth');
  },

  heroHtml: function () {
    var image = (typeof LANDING_IMAGE === 'string') ? LANDING_IMAGE.trim() : '';
    var m = typeof cncManufacturerInfo === 'function' ? cncManufacturerInfo() : { name: '', certs: [] };
    var card = function (id, label, bodyHtml) {
      return '<div class="navy-spec-card" id="' + id + '"><p class="navy-spec-label">' + escHtml(label) + '</p><div class="navy-spec-value">' + bodyHtml + '</div></div>';
    };
    var side = image
      ? '<div class="navy-hero-photo"><img src="' + escHtml(image) + '" alt="' + escHtml(t('navy_image_alt')) + '" loading="lazy"></div>'
      : '<div class="navy-spec-cards">' +
          card('navy-card-material', t('navy_card_material'), '<p>' + this.specHtml('Ti-6Al-4V ELI · Grade 23 · ASTM F136') + '</p>') +
          card('navy-card-tolerance', t('navy_card_tolerance'), '<p class="navy-spec-big">' + this.specHtml('<5μm') + '</p>') +
          (m.name ? card('navy-card-manufacturer', t('navy_card_manufacturer'),
            '<p class="navy-spec-name">' + escHtml(m.name) + '</p>' +
            (m.certs.length ? '<ul class="navy-spec-certs">' + m.certs.map(function (c) { return '<li>' + LandingNavy.specHtml(c) + '</li>'; }).join('') + '</ul>' : '')) : '') +
        '</div>';
    return '<section class="navy-split navy-hero-split" aria-labelledby="navy-hero-title">' +
      '<div class="navy-hero-main">' +
        '<p class="navy-eyebrow"><span class="navy-eyebrow-line" aria-hidden="true"></span><span>' + this.specHtml(t('navy_eyebrow')) + '</span></p>' +
        '<h1 class="navy-hero-title" id="navy-hero-title">' + escHtml(t('navy_hero_title')) + '</h1>' +
        '<p class="navy-hero-desc">' + escHtml(t('navy_hero_desc')) + '</p>' +
        '<div class="navy-cta">' +
          '<button type="button" class="navy-btn navy-btn-gold" onclick="handleStartOrder()">' + escHtml(t('navy_cta_start')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
          '<a class="navy-btn navy-btn-ghost" href="#/about">' + escHtml(t('navy_cta_how')) + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="navy-hero-side">' + side + '</div>' +
    '</section>';
  },

  restHtml: function () {
    var self = this;
    var mfr = this.mfrName();
    // (2) Why allAbut — 회사소개 강점 1~4
    var why = '<section class="navy-section navy-why" aria-labelledby="navy-why-title"><div class="navy-wrap navy-why-grid">' +
      '<h2 class="navy-h2" id="navy-why-title">' + escHtml(t('navy_why_title')) + '</h2>' +
      '<div class="navy-why-cards">' + [1, 2, 3, 4].map(function (n) {
        return '<article class="navy-why-card">' +
          '<span class="navy-why-num mono" aria-hidden="true">0' + n + '</span>' +
          '<h3 class="navy-why-card-title">' + self.specHtml(t('about_why' + n + '_title')) + '</h3>' +
          '<p class="navy-why-card-text">' + self.specHtml(tf('about_why' + n + '_text', { manufacturer: mfr })) + '</p>' +
        '</article>';
      }).join('') + '</div>' +
    '</div></section>';
    // (3) How it works — 주문 5단계 (3번만 골드) + 네이비 면
    var how = '<section class="navy-section navy-how" aria-labelledby="navy-how-title"><div class="navy-split navy-how-split">' +
      '<div class="navy-how-steps">' +
        '<h2 class="navy-h2" id="navy-how-title">' + escHtml(t('navy_how_title')) + '</h2>' +
        '<ol class="navy-steps" aria-label="' + escHtml(t('navy_steps_aria')) + '">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<li class="navy-step' + (n === 3 ? ' navy-step-gold' : '') + '"><span class="navy-step-num mono" aria-hidden="true">' + n + '</span>' +
            '<span class="navy-step-label">' + escHtml(t('wiz_step' + n)) + '</span></li>';
        }).join('') + '</ol>' +
      '</div>' +
      '<div class="navy-how-panel">' +
        '<p class="navy-how-head">' + escHtml(t('navy_how_head')) + '</p>' +
        '<p class="navy-how-desc">' + escHtml(t('navy_how_desc')) + '</p>' +
      '</div>' +
    '</div></section>';
    // (4) 가격 — 못 읽으면 구역 전체 숨김
    var price = '';
    if (this.packages && this.packages.length) {
      var maxCredits = Math.max.apply(null, this.packages.map(function (p) { return Number(p.credits) || 0; }));
      price = '<section class="navy-section navy-price" id="navy-price" aria-labelledby="navy-price-title"><div class="navy-wrap">' +
        '<h2 class="navy-h2" id="navy-price-title">' + escHtml(t('navy_price_title')) + '</h2>' +
        '<ul class="navy-price-cards">' + this.packages.map(function (p) {
          var credits = Number(p.credits) || 0;
          var num = formatTHB(p.unit_price).replace(/\s*THB$/, '');
          // 1 이면 단수 문구(navy_price_credits_one — en · es · ar), 숫자만 Mono
          var label = escHtml(tf('navy_price_credits', { n: credits })).replace(String(credits), '<span class="mono">' + escHtml(formatNumber(credits)) + '</span>');
          return '<li class="navy-price-card' + (credits === maxCredits ? ' navy-price-top' : '') + '">' +
            '<p class="navy-price-credits">' + label + '</p>' +
            '<p class="navy-price-amount"><span class="mono" dir="ltr">' + escHtml(num) + '</span> <span class="navy-price-unit">THB</span></p>' +
            '<p class="navy-price-per">' + escHtml(t('navy_price_per')) + '</p>' +
          '</li>';
        }).join('') + '</ul>' +
        '<p class="navy-price-note">' + escHtml(tf('navy_price_note', { vat: formatNumber(this.vat) })) + '</p>' +
      '</div></section>';
    }
    // (5) 마지막 띠 — LINE 주소는 company_settings (cncContactInfo → cncLineUrl)
    var lineUrl = typeof cncContactInfo === 'function' ? cncContactInfo().lineUrl : cncLineUrl('');
    var final = '<section class="navy-section navy-final" aria-labelledby="navy-final-title"><div class="navy-wrap navy-final-inner">' +
      '<h2 class="navy-h2" id="navy-final-title">' + escHtml(t('navy_final_title')) + '</h2>' +
      '<div class="navy-cta">' +
        '<button type="button" class="navy-btn navy-btn-navy" onclick="LandingNavy.signup()">' + escHtml(t('navy_final_signup')) + '</button>' +
        '<a class="navy-btn navy-btn-line" href="' + escHtml(lineUrl) + '" target="_blank" rel="noopener">' + escHtml(t('navy_final_line')) + '</a>' +
      '</div>' +
    '</div></section>';
    return why + how + price + final;
  },

  render: function () {
    if (!this.hero) return;
    var pricing = document.querySelector('#screen-landing .landing-nav-pricing');
    if (pricing) pricing.textContent = t('navy_nav_pricing');
    this.hero.innerHTML = this.heroHtml();
    this.rest.innerHTML = this.restHtml();
  },

  // 회사 정보(제조사 · LINE) · 가격(판매 중 어버트먼트 패키지) — 실패하면 그 부분만 조용히 숨김
  loadData: function () {
    var self = this;
    if (typeof cncGetCompany === 'function') cncGetCompany().then(function () { self.render(); }, function () { /* 기본값 */ });
    if (typeof cncGetPackages === 'function') {
      cncGetPackages().then(function (rows) {
        var list = cncPackagesFor(rows || [], 'abutment').filter(function (p) { return Number(p.unit_price) > 0 && Number(p.credits) > 0; });
        list.sort(function (x, y) { return Number(x.credits) - Number(y.credits); });
        self.packages = list.length ? list : null;
        self.render();
      }, function () { self.packages = null; self.render(); });
    }
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { LandingNavy.init(); });
else LandingNavy.init();
