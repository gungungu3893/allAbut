// 첫 화면 로고 인트로: A 꼭짓점 → 불꽃 → 빛이 모여 5μm → 빛나는 선 (차분한 버전, 약 8초)
// LogoIntro.maybePlay() : 페이지를 열 때마다 1번 (새로고침 포함) / LogoIntro.play() : 무조건 / LogoIntro.stop()
var LogoIntro = (function () {
  var raf = null, stage = null, cv = null, umEl = null, aEl = null, timer = null;
  var playedThisLoad = false;   // 이 페이지(새로고침 전까지)에서 이미 재생했는지 — 로그인 화면 갔다 돌아와도 다시 안 함

  // 예전 버전이 남긴 "탭당 1번" 기록은 이제 안 써요 → 한 번 지워요 (실패해도 괜찮아요)
  try { sessionStorage.removeItem('allabut_intro_played'); } catch (e) { /* 무시 */ }

  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function smooth(v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }

  function find() {
    var logo = document.querySelector('.logo-hero');
    if (!logo) return false;
    stage = logo.closest('.screen') || logo.parentElement;
    aEl = logo.querySelector('.logo-a');
    umEl = logo.querySelector('.logo-um');
    if (!aEl || !umEl) return false;
    cv = stage.querySelector('canvas.logo-fx');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'logo-fx';
      cv.setAttribute('aria-hidden', 'true');
      stage.appendChild(cv);
    }
    return true;
  }

  // 흰 메뉴 줄(.landing-nav) 아래쪽 y (캔버스 좌표). 메뉴 줄을 못 찾으면 84px
  function topLimit(box) {
    var nav = stage.querySelector('.landing-nav, header, nav');
    if (!nav) return 84;
    var r = nav.getBoundingClientRect();
    return Math.max(40, r.bottom - box.top + 16);
  }

  // 5μm 글자 모양의 점 좌표 (실제 글자와 같은 글꼴·크기로 그려서 뽑음, 너무 많으면 줄임)
  function textPoints(el, box) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var S = 4, pad = 3;
    var w = Math.ceil((r.width + pad * 2) * S), h = Math.ceil((r.height + pad * 2) * S);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.scale(S, S);
    x.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    var txt = el.textContent;
    var m = x.measureText(txt);
    var fsz = parseFloat(cs.fontSize);
    var asc = m.fontBoundingBoxAscent || fsz * 0.8, desc = m.fontBoundingBoxDescent || fsz * 0.2;
    x.fillText(txt, pad, pad + (r.height - (asc + desc)) / 2 + asc);
    var d = x.getImageData(0, 0, w, h).data, pts = [];
    var step = Math.max(2, Math.round(S * fsz / 22));
    for (var yy = 0; yy < h; yy += step) for (var xx = 0; xx < w; xx += step)
      if (d[(yy * w + xx) * 4 + 3] > 120) pts.push({ x: r.left - box.left - pad + xx / S, y: r.top - box.top - pad + yy / S });
    while (pts.length > 240) pts.splice(Math.floor(Math.random() * pts.length), 1);
    return pts;
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (stage) stage.classList.remove('logo-intro-run');
    if (umEl) umEl.classList.remove('shine');
    if (cv) { var c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); cv.style.opacity = 0; }
  }

  function play() {
    if (!find()) return;
    stop();
    if (reduced()) return;
    stage.classList.add('logo-intro-run');

    var box = stage.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.opacity = 1;

    var ar = aEl.getBoundingClientRect();
    var fs = parseFloat(getComputedStyle(aEl).fontSize);               // A 글자 크기
    var apex = { x: ar.left - box.left + ar.width / 2, y: ar.top - box.top + ar.height * 0.2 };
    var R = Math.max(95, Math.min(200, fs * 2.5));                      // 불꽃 반경
    var TOP = topLimit(box);
    var by = Math.max(apex.y - fs * 2.3, TOP + R * 0.75);               // 터지는 높이 (메뉴 줄에 안 가리게)
    if (by > apex.y - fs * 0.9) { by = apex.y - fs * 0.9; R = Math.max(70, (by - TOP) / 0.75); }
    var burst = { x: apex.x + fs * 0.1, y: by };

    // 타이밍(초): 솟기 1.4 → 아주 천천히 터짐 → 2.1초 뒤부터 2.0초 동안 모임 → 0.8초 글자로 바뀜 → 빛나는 선 1.8초
    var RISE = 1.4, K = 0.7, C0 = 2.1, CONV = 2.0, SPREAD = 0.4, TRAIL = 0.6, FADE = 0.8;
    var END = RISE + C0 + CONV + SPREAD + 0.05;
    var COL = '#F2C14E', CORE = '#FFE7A3';

    function spark(target) {
      var z = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, q = Math.sqrt(1 - z * z);
      var sp = R * K * (0.88 + Math.random() * 0.12);
      return { vx: Math.cos(ph) * q * sp, vy: Math.sin(ph) * q * sp, G: R * 0.22, tw: Math.random() * 6.28,
        target: target || null, delay: Math.random() * SPREAD, fade0: 1.3 + Math.random() * 0.8, fadeLen: 1.0 + Math.random() * 0.6, hist: [] };
    }
    var parts = [];
    for (var i = 0; i < 140; i++) parts.push(spark(null));
    textPoints(umEl, box).forEach(function (t) { parts.push(spark(t)); });
    var rocketHist = [];

    function trail(h, t, len, a, color, width) {
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      for (var i = 1; i < h.length; i++) {
        var k = 1 - (t - h[i].t) / len;
        if (k <= 0) continue;
        ctx.globalAlpha = a * k * k;
        ctx.lineWidth = width * (0.35 + 0.65 * k);
        ctx.beginPath(); ctx.moveTo(h[i - 1].x, h[i - 1].y); ctx.lineTo(h[i].x, h[i].y); ctx.stroke();
      }
    }
    function cut(h, t, len) { while (h.length > 2 && t - h[0].t > len) h.shift(); }

    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = (ts - start) / 1000;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.globalCompositeOperation = 'lighter';

      // 1) A 에서 솟는 불씨
      var u0 = t / RISE;
      if (u0 <= 1.2) {
        var p = 1 - Math.pow(1 - Math.min(1, u0), 2.2);
        var hx = apex.x + (burst.x - apex.x) * p, hy = apex.y + (burst.y - apex.y) * p;
        if (u0 <= 1) rocketHist.push({ x: hx, y: hy, t: t });
        cut(rocketHist, t, 0.5);
        trail(rocketHist, t, 0.5, 0.9, CORE, 1.6);
        if (u0 <= 1) {
          ctx.globalAlpha = 0.3; ctx.fillStyle = CORE; ctx.beginPath(); ctx.arc(hx, hy, 3.9, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, 6.283); ctx.fill();
        }
      }

      // 2) 터질 때 번쩍
      var ub = t - RISE;
      if (ub >= 0 && ub < 0.6) {
        var fr = R * 0.55, fa = 1 - ub / 0.6;
        var g = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, fr);
        g.addColorStop(0, 'rgba(255,244,214,' + (0.55 * fa) + ')'); g.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(burst.x - fr, burst.y - fr, fr * 2, fr * 2);
      }

      // 3) 빛줄기 (공 모양으로 퍼짐 → 꼬리 → 천천히 처짐 → 일부는 모여 5μm)
      if (ub >= 0) parts.forEach(function (q) {
        var f = (1 - Math.exp(-K * ub)) / K;
        var ex = burst.x + q.vx * f, ey = burst.y + q.vy * f + 0.5 * q.G * ub * ub;
        var x = ex, y = ey, a, w = 0, len = TRAIL;
        if (q.target) {
          w = smooth((ub - C0 - q.delay) / CONV);
          x = ex + (q.target.x - ex) * w; y = ey + (q.target.y - ey) * w;
          a = w < 1 ? 0.75 + 0.25 * Math.sin(q.tw + ub * 8) : 1;
          len = TRAIL * (1 - 0.85 * w);
        } else {
          a = 1 - smooth((ub - q.fade0) / q.fadeLen);
          if (a <= 0.01) return;
          if (ub > q.fade0) a *= 0.55 + 0.45 * Math.sin(q.tw + ub * 12);
        }
        q.hist.push({ x: x, y: y, t: t });
        cut(q.hist, t, len);
        if (q.target && w > 0.9) {
          ctx.globalAlpha = 0.55; ctx.fillStyle = '#D4AF37';
          ctx.beginPath(); ctx.arc(x, y, 0.5, 0, 6.283); ctx.fill();
          return;
        }
        trail(q.hist, t, len, a * 0.85, COL, 1.3);
        ctx.globalAlpha = a; ctx.fillStyle = CORE;
        ctx.beginPath(); ctx.arc(x, y, 0.9, 0, 6.283); ctx.fill();
      });

      if (t >= END) { stage.classList.remove('logo-intro-run'); cv.style.opacity = Math.max(0, 1 - (t - END) / FADE); }
      if (t < END + FADE + 0.05) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, box.width, box.height); raf = null;
      umEl.classList.remove('shine'); void umEl.offsetWidth; umEl.classList.add('shine');   // 4) 빛나는 선
    }
    raf = requestAnimationFrame(frame);
  }

  // 페이지를 열 때마다 1번 (새로고침 포함). 같은 페이지 안에서 랜딩으로 돌아오면 다시 안 함
  function maybePlay() {
    if (playedThisLoad) return;
    playedThisLoad = true;
    var go = function () { timer = setTimeout(play, 500); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }

  document.addEventListener('animationend', function (e) {
    if (e.animationName === 'um-shine' && e.target.classList) e.target.classList.remove('shine');
  });

  return { play: play, maybePlay: maybePlay, stop: stop };
})();
