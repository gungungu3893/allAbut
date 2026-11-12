// ===== 랜딩 방문자 숫자 "TODAY 12 · TOTAL 1,234" =====
// 흰 메뉴 줄 바로 아래, 어두운 본문 오른쪽 위 (RTL 은 왼쪽, 좁은 화면은 가운데 한 줄) — 위치는 css/landing.css .visit-counter
// - 이번 방문이 기록된 뒤에 불러와서 내 방문도 포함돼요 (app.js boot: cncTrackVisit().then(VisitCounter.load))
// - 숫자는 0 → 실제 값으로 0.8초 카운트업 (prefers-reduced-motion 이면 바로)
// - 숫자를 못 받으면(013 실행 전 · 오류) 아무것도 안 보여요 → 레이아웃이 흔들리지 않게 칸은 처음부터 absolute
// - 라벨 TODAY / TOTAL 은 영어 그대로 (번역 안 함), 숫자는 .mono 골드 + formatNumber 쉼표

var VisitCounter = {
  counts: null,
  raf: null,

  load: async function () {
    var c = await cncGetVisitCounts();
    if (!c) return;
    this.counts = c;
    this.render(true);
  },

  render: function (animate) {
    var el = document.getElementById('visit-counter');
    if (!el || !this.counts) return;
    el.innerHTML =
      '<span class="vc-item"><span class="vc-label">TODAY</span> <span class="mono vc-num" data-to="' + this.counts.today + '">0</span></span>' +
      '<span class="vc-sep" aria-hidden="true">·</span>' +
      '<span class="vc-item"><span class="vc-label">TOTAL</span> <span class="mono vc-num" data-to="' + this.counts.total + '">0</span></span>';
    el.setAttribute('aria-label', 'TODAY ' + this.counts.today + ', TOTAL ' + this.counts.total);
    el.hidden = false;
    var nums = el.querySelectorAll('.vc-num');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced) {
      for (var i = 0; i < nums.length; i++) nums[i].textContent = formatNumber(+nums[i].getAttribute('data-to'));
      return;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    var self = this, start = null, DUR = 800;
    function step(ts) {
      if (start === null) start = ts;
      var k = Math.min(1, (ts - start) / DUR);
      var e = 1 - Math.pow(1 - k, 3);   // 끝에서 천천히
      for (var j = 0; j < nums.length; j++) nums[j].textContent = formatNumber(Math.round(+nums[j].getAttribute('data-to') * e));
      self.raf = k < 1 ? requestAnimationFrame(step) : null;
    }
    this.raf = requestAnimationFrame(step);
  }
};

// 언어를 바꾸면 숫자 쉼표 모양만 다시 (카운트업 없이)
window.addEventListener('langchange', function () { VisitCounter.render(false); });
