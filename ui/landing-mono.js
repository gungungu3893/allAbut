// ===== 흑백 미니멀 랜딩 본문 (config.js 의 SITE_THEME = 'mono' 일 때만) =====
// classic 이면 아무것도 하지 않아요 → 예전 랜딩(큰 로고 · 슬로건 · 불꽃 인트로)이 그대로예요.
// mono 이면:
//   - 랜딩 메뉴 줄에 "가격"(#/credit-policy) 링크를 회사소개 다음에 넣어요
//   - 본문 <div class="mono-landing"> 를 넣어요:
//       큰 제목 두 줄(mono_hero_l1 · 회색 mono_hero_l2) → 설명 한 줄 → [Start an order](handleStartOrder) + "See how it works"(#/about)
//       → 옅은 면 안에 주문 5단계(01~05 + 기존 wiz_step1~5) (config.js 의 LANDING_IMAGE 가 있으면 면 위쪽에 그 사진)
//       → 세 가지 사실 한 줄: <5μm 공차 / 소재 / "치아 1개당 {가격} THB 부터, VAT 별도"
//   - {가격} = 판매 중인 어버트먼트 패키지 중 가장 싼 단가(credit_packages, 로그인 전에도 읽혀요) → formatTHB 규칙의 숫자. 못 읽으면 이 항목만 숨겨요
// 숫자 · 규격 글자(01~05 · <5μm · Grade 23 · Ti-6Al-4V ELI · ASTM F136 · 가격 숫자)만 Mono 글꼴, 단위 "THB" 는 Sans
// 화면 모양은 css/theme-mono.css (html[data-site-theme="mono"] 아래)

var LANDING_MONO_SPECS = ['<5μm', 'Ti-6Al-4V ELI', 'ASTM F136', 'Grade 23'];

var LandingMono = {
  box: null,
  price: null,          // 가장 싼 어버트먼트 1크레딧 단가 (VAT 별도), 못 읽으면 null

  init: function () {
    if (!(window.cncIsMono && cncIsMono())) return;
    var land = document.getElementById('screen-landing');
    if (!land || this.box) return;

    // 1) 메뉴 줄: 로고 · 회사소개 · **가격** · 언어 · 로그인
    var about = land.querySelector('.landing-nav-right .landing-nav-link');
    if (about && !land.querySelector('.landing-nav-pricing')) {
      var a = document.createElement('a');
      a.href = '#/credit-policy';
      a.className = 'landing-nav-link landing-nav-pricing';
      a.setAttribute('data-i18n', 'mono_nav_pricing');   // 언어를 바꾸면 applyStaticTranslations 가 글자를 바꿔요
      a.textContent = t('mono_nav_pricing');
      about.parentNode.insertBefore(a, about.nextSibling);
    }

    // 2) 본문 (순서는 css 의 order 로: 메뉴 줄 → 방문자 숫자 → 본문 → Beta · 이벤트 배너 → 광고)
    var box = document.createElement('div');
    box.className = 'mono-landing';
    box.id = 'mono-landing';
    var counter = document.getElementById('visit-counter');
    land.insertBefore(box, counter ? counter.nextSibling : land.firstChild);
    this.box = box;
    this.render();
    this.loadPrice();
    window.addEventListener('langchange', function () { LandingMono.render(); });
  },

  // 번역문을 안전하게(escHtml) 바꾼 뒤 규격 글자만 Mono 로 감싸요 ("<" 는 &lt;, 아랍어 · 페르시아어에서도 뒤집히지 않게 dir="ltr")
  specHtml: function (text) {
    var html = escHtml(text);
    var toks = LANDING_MONO_SPECS.map(escHtml).sort(function (x, y) { return y.length - x.length; });
    var re = new RegExp(toks.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');
    return html.replace(re, function (m) { return '<span class="mono" dir="ltr">' + m + '</span>'; });
  },

  // "From {price} THB per tooth, excluding VAT" → 숫자만 Mono (formatTHB 규칙: 1,500.00)
  priceHtml: function () {
    var mark = '\u0000';
    var num = formatTHB(this.price).replace(/\s*THB$/, '');
    return escHtml(tf('mono_fact_price', { price: mark })).split(mark).join('<span class="mono" dir="ltr">' + escHtml(num) + '</span>');
  },

  render: function () {
    if (!this.box) return;
    var pricing = document.querySelector('#screen-landing .landing-nav-pricing');
    if (pricing) pricing.textContent = t('mono_nav_pricing');
    var image = (typeof LANDING_IMAGE === 'string') ? LANDING_IMAGE.trim() : '';
    var steps = [1, 2, 3, 4, 5].map(function (n) {
      return '<li class="mono-step">' +
        '<span class="mono-step-num" aria-hidden="true">' + ('0' + n) + '</span>' +
        '<span class="mono-step-label">' + escHtml(t('wiz_step' + n)) + '</span>' +
      '</li>';
    }).join('');
    var facts = [
      '<li class="mono-fact" id="mono-fact-tolerance">' + this.specHtml(t('mono_fact_tolerance')) + '</li>',
      '<li class="mono-fact" id="mono-fact-material">' + this.specHtml(t('mono_fact_material')) + '</li>'
    ];
    if (this.price) facts.push('<li class="mono-fact" id="mono-fact-price">' + this.priceHtml() + '</li>');   // 못 읽으면 이 항목만 없음
    this.box.innerHTML =
      '<h1 class="mono-hero-title"><span class="mono-hero-l1">' + escHtml(t('mono_hero_l1')) + '</span>' +
        '<span class="mono-hero-l2">' + escHtml(t('mono_hero_l2')) + '</span></h1>' +
      '<p class="mono-hero-desc">' + escHtml(t('mono_hero_desc')) + '</p>' +
      '<div class="mono-cta">' +
        '<button type="button" class="mono-btn-primary" onclick="handleStartOrder()">' + escHtml(t('mono_cta_start')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
        '<a class="mono-link" href="#/about">' + escHtml(t('mono_cta_how')) + '</a>' +
      '</div>' +
      '<section class="mono-steps-panel" aria-label="' + escHtml(t('mono_steps_aria')) + '">' +
        (image ? '<div class="mono-landing-photo"><img src="' + escHtml(image) + '" alt="' + escHtml(t('mono_landing_image_alt')) + '" loading="lazy"></div>' : '') +
        '<ol class="mono-steps">' + steps + '</ol>' +
      '</section>' +
      '<ul class="mono-facts">' + facts.join('') + '</ul>';
  },

  // 가장 싼 어버트먼트 단가 (판매 중 패키지, sql/018 전이면 전부 어버트먼트) — 실패하면 조용히 숨김
  loadPrice: function () {
    var self = this;
    if (typeof cncGetPackages !== 'function') return;
    cncGetPackages().then(function (rows) {
      var list = cncPackagesFor(rows || [], 'abutment')
        .map(function (p) { return Number(p.unit_price); })
        .filter(function (v) { return isFinite(v) && v > 0; });
      self.price = list.length ? Math.min.apply(null, list) : null;
      self.render();
    }, function () { self.price = null; self.render(); });
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { LandingMono.init(); });
else LandingMono.init();
