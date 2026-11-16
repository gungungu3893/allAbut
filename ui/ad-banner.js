// ===== 광고 배너 자리 (자체 배너만, sql/019) =====
// 자리 = 빈 상자 <div class="ad-slot" data-ad-slot="landing|home|order_done" hidden></div>
//   - 노출 중인 배너가 없으면 상자는 hidden 그대로 → 자리 자체가 안 생겨요 (높이 0, 레이아웃 그대로)
//   - 있으면: 작은 회색 "AD" + 이미지 (PC = image_desktop_url, 휴대폰 600px 미만 = image_mobile_url, 없으면 PC 이미지)
//     PC 728×90 비율 · 휴대폰 320×100 비율 (css/app.css .ad-frame), 이미지를 누르면 새 탭 (rel="noopener sponsored")
//   - 같은 자리에 여러 개면 sort_order 순으로 7초마다 천천히 바뀌어요 (움직임 줄이기 설정이면 첫 번째로 고정)
//   - 노출 기록 'ad_view' = 같은 페이지 보기에서 같은 배너는 1번만 (화면에 보일 때), 클릭 'ad_click'
// 새 주문 작성 중 · 충전 결제 · 관리자 화면에는 자리를 만들지 않아요
// 서비스 상태(test / live)와 상관없이 똑같이 동작해요

var AdBanner = {
  ROTATE_MS: 7000,
  seen: {},        // 이번 페이지 보기에서 노출을 기록한 배너 { id: true }
  timers: [],      // 돌아가는 회전 타이머 [{ el, timer }]

  // 페이지가 바뀌었을 때 (경로 변경 · 랜딩 다시 보임) → 노출 기록을 새로
  newPage: function () {
    this.seen = {};
  },

  reduced: function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  // el 안에 자리 채우기 (el 이 없거나 화면에서 떨어져 있으면 아무것도 안 해요)
  mount: function (el, slot) {
    if (!el || AD_SLOTS.indexOf(slot) === -1) return;
    var self = this;
    var cached = cncCachedBanners(slot);
    if (cached) this.render(el, slot, cached);   // 이미 읽은 게 있으면 바로 (다시 그릴 때 깜빡임 없게)
    cncGetActiveBanners(slot).then(function (rows) {
      if (!document.body.contains(el)) return;
      var now = (el.getAttribute('data-ad-ids') || '');
      var ids = rows.map(function (b) { return b.id; }).join(',');
      if (cached && now === ids) { self.view(el); return; }   // 같으면 그대로 (노출만 다시 확인)
      self.render(el, slot, rows);
    });
  },

  // 화면에 있는 모든 자리 다시 채우기 (예: 랜딩이 보일 때)
  mountAll: function (root) {
    var els = (root || document).querySelectorAll('[data-ad-slot]');
    for (var i = 0; i < els.length; i++) this.mount(els[i], els[i].getAttribute('data-ad-slot'));
  },

  render: function (el, slot, rows) {
    this.stop(el);
    el.setAttribute('data-ad-ids', rows.map(function (b) { return b.id; }).join(','));
    if (!rows.length) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = '<div class="ad-banner ad-banner-' + slot + '" role="complementary" aria-label="' + escHtml(t('ad_label_aria')) + '">' +
      '<span class="ad-label" aria-hidden="true">AD</span>' +
      '<div class="ad-frame">' + rows.map(function (b, i) {
        var desk = cncAdSafeUrl(b.image_desktop_url);
        var mob = cncAdSafeUrl(b.image_mobile_url) || desk;
        return '<a class="ad-item' + (i === 0 ? ' active' : '') + '" href="' + escHtml(cncAdSafeUrl(b.link_url)) + '" target="_blank" rel="noopener sponsored"' +
          ' data-ad-id="' + Number(b.id) + '"' + (i === 0 ? '' : ' tabindex="-1" aria-hidden="true"') +
          ' onclick="AdBanner.click(' + Number(b.id) + ')">' +
          '<picture><source media="(max-width: 599px)" srcset="' + escHtml(mob) + '">' +
          '<img src="' + escHtml(desk) + '" alt="' + escHtml(b.alt_text || t('ad_default_alt')) + '" loading="lazy" decoding="async"></picture></a>';
      }).join('') + '</div></div>';
    this.view(el);
    // 화면이 아직 나타나는 중이면(페이드인) 조금 뒤에 다시 확인 — 보일 때만 노출로 쳐요
    var me = this;
    setTimeout(function () { if (document.body.contains(el)) me.view(el); }, 700);
    if (rows.length > 1 && !this.reduced()) {
      var self = this;
      var timer = setInterval(function () { self.next(el); }, this.ROTATE_MS);
      this.timers.push({ el: el, timer: timer });
    }
  },

  // 다음 배너로 (천천히 — CSS opacity 전환)
  next: function (el) {
    if (!document.body.contains(el)) { this.stop(el); return; }
    var items = el.querySelectorAll('.ad-item');
    if (items.length < 2) return;
    var cur = 0;
    for (var i = 0; i < items.length; i++) if (items[i].classList.contains('active')) cur = i;
    var nx = (cur + 1) % items.length;
    items[cur].classList.remove('active'); items[cur].setAttribute('tabindex', '-1'); items[cur].setAttribute('aria-hidden', 'true');
    items[nx].classList.add('active'); items[nx].removeAttribute('tabindex'); items[nx].removeAttribute('aria-hidden');
    this.view(el);
  },

  // 지금 보이는 배너 노출 기록 (자리가 화면에 보일 때만, 이번 페이지 보기에서 1번)
  view: function (el) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    var a = el.querySelector('.ad-item.active');
    if (!a) return;
    var id = a.getAttribute('data-ad-id');
    if (this.seen[id]) return;
    this.seen[id] = true;
    cncTrackAd('ad_view', id);
  },

  click: function (id) {
    cncTrackAd('ad_click', id);   // 링크는 그대로 새 탭으로 열려요
  },

  stop: function (el) {
    this.timers = this.timers.filter(function (x) {
      if (!el || x.el === el || !document.body.contains(x.el)) { clearInterval(x.timer); return false; }
      return true;
    });
  }
};

// 경로가 바뀌면 새 페이지 보기 (노출 기록 다시 1번씩)
window.addEventListener('hashchange', function () { AdBanner.newPage(); AdBanner.stop(null); });
