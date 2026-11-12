// ================================================================
// allAbut — 방문자 집계 (로직만, 화면 코드 없음) — DB: sql/013_site_analytics.sql
// ================================================================
// 목적: 광고 배너 판매용 숫자 → 걸러내지 않고 전부 기록 (로봇 · 직원 · 새로고침 포함). 종류(is_bot · 직원)는 같이 저장
//   visit    : 사이트를 열 때마다 1번 (새로고침 포함) — app.js 의 boot 에서 cncTrackVisit()
//   pageview : 화면 경로가 바뀔 때마다 1번 (같은 경로 연속은 1번) — router · showScreen 에서 cncTrackPage(path)
//   경로: 랜딩 '/landing', 로그인 화면 '/signin', 나머지는 해시 경로에서 쿼리를 뺀 것 (#/orders?id=… → '#/orders')
// 개인정보 최소화: IP · 전체 user agent 는 보내지 않아요. visitor_id(localStorage) · session_id(sessionStorage) 는 무작위 UUID
// 실패해도 화면에 영향 없게 조용히 (await 로 화면을 막지 않아요)

var ANALYTICS_VISITOR_KEY = 'allabut_visitor_id';
var ANALYTICS_SESSION_KEY = 'allabut_session_id';
var ANALYTICS_BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|phantom|puppeteer|playwright|selenium|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|bingpreview|google-inspectiontool|ahrefs|semrush|mj12/i;

function cncUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 아래로 */ }
  // crypto.randomUUID 가 없는 오래된 브라우저
  var h = '0123456789abcdef', s = '';
  for (var i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { s += '-'; continue; }
    if (i === 14) { s += '4'; continue; }
    var r = Math.floor(Math.random() * 16);
    s += h.charAt(i === 19 ? (r & 3) | 8 : r);
  }
  return s;
}

// 저장소에서 읽고 없으면 만들어 저장 (저장 실패해도 이번 페이지 동안은 같은 값)
var _analyticsIds = {};
function cncStoredId(storage, key) {
  if (_analyticsIds[key]) return _analyticsIds[key];
  var v = '';
  try { v = storage.getItem(key) || ''; } catch (e) { v = ''; }
  if (!/^[0-9a-f-]{36}$/i.test(v)) {
    v = cncUuid();
    try { storage.setItem(key, v); } catch (e) { /* 무시 */ }
  }
  _analyticsIds[key] = v;
  return v;
}
function cncVisitorId() { try { return cncStoredId(localStorage, ANALYTICS_VISITOR_KEY); } catch (e) { return cncStoredId({ getItem: function () { return ''; }, setItem: function () {} }, ANALYTICS_VISITOR_KEY); } }
function cncSessionId() { try { return cncStoredId(sessionStorage, ANALYTICS_SESSION_KEY); } catch (e) { return cncStoredId({ getItem: function () { return ''; }, setItem: function () {} }, ANALYTICS_SESSION_KEY); } }

function cncIsBot() {
  var ua = String(navigator.userAgent || '');
  return ANALYTICS_BOT_RE.test(ua) || !!navigator.webdriver;
}

// 기기: 휴대폰 / 태블릿 / PC (화면 폭 · 터치 · user agent 로 간단히)
function cncDeviceType() {
  var ua = String(navigator.userAgent || '');
  var w = Math.min(window.screen ? screen.width : window.innerWidth, window.innerWidth || 9999) || window.innerWidth || 1024;
  var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'mobile';
  if (/Macintosh/i.test(ua) && touch) return 'tablet';   // iPadOS 는 Mac 처럼 보여요
  if (touch && w < 768) return 'mobile';
  if (touch && w < 1200) return 'tablet';
  return 'desktop';
}

// 들어온 곳: document.referrer 의 호스트만 (같은 사이트면 빈 값, LINE 앱 안 브라우저면 'line')
function cncReferrerHost() {
  var ua = String(navigator.userAgent || '');
  if (/\bLine\//i.test(ua)) return 'line';
  var ref = String(document.referrer || '');
  if (!ref) return '';
  try {
    var host = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
    var here = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
    return host === here ? '' : host.slice(0, 100);
  } catch (e) {
    return '';
  }
}

// 해시 경로에서 쿼리 · id 를 빼요: '#/orders?id=CA…' → '#/orders', '#/admin/orders?order=…' → '#/admin/orders'
function cncNormPath(hash) {
  var h = String(hash || '').split('?')[0];
  if (!h || h === '#' || h === '#/') return '#/';
  return h.slice(0, 100);
}

function cncSendEvent(kind, path) {
  try {
    if (!window.sb || !sb.rpc) return Promise.resolve(false);
    return Promise.resolve(sb.rpc('log_site_event', {
      p_kind: kind, p_visitor: cncVisitorId(), p_session: cncSessionId(), p_path: String(path || '').slice(0, 100),
      p_referrer_host: cncReferrerHost(), p_device: cncDeviceType(),
      p_lang: (typeof currentLang === 'string' ? currentLang : String(navigator.language || '')).slice(0, 10),
      p_is_bot: cncIsBot()
    })).then(function (r) { return !(r && r.error); }, function () { return false; });
  } catch (e) {
    return Promise.resolve(false);
  }
}

// 방문 1번 (사이트를 열 때마다). 돌려주는 Promise 는 기록이 끝나면(성공·실패 모두) 풀려요
var _visitPromise = null;
function cncTrackVisit(path) {
  if (!_visitPromise) _visitPromise = cncSendEvent('visit', path || cncNormPath(location.hash) || '#/');
  return _visitPromise;
}

// 페이지뷰 (같은 경로가 연속이면 1번만)
var _lastPageview = null;
function cncTrackPage(path) {
  var p = String(path || '').slice(0, 100);
  if (!p || p === _lastPageview) return;
  _lastPageview = p;
  cncSendEvent('pageview', p);
}

// 랜딩 TODAY / TOTAL → { today, total } 또는 null (013 실행 전 · 실패)
async function cncGetVisitCounts() {
  try {
    var r = await sb.rpc('get_visit_counts');
    if (r.error) return null;
    var d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    if (!d || d.today == null || d.total == null) return null;
    return { today: Number(d.today) || 0, total: Number(d.total) || 0 };
  } catch (err) {
    return null;
  }
}


// ================================================================
// 관리자 — 방문 통계 (staff 이상, admin_visit_stats)
// ================================================================
// 기간 (방콕 날짜): 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' → { from, to }
function cncBkkToday() {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); } catch (e) { return new Date().toISOString().slice(0, 10); }
}
function cncDayPlus(ds, n) {
  var p = String(ds).split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function cncVisitRange(key) {
  var today = cncBkkToday();
  var p = today.split('-');
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: cncDayPlus(today, -1), to: cncDayPlus(today, -1) };
    case '30d': return { from: cncDayPlus(today, -29), to: today };
    case 'month': return { from: p[0] + '-' + p[1] + '-01', to: today };
    case 'last_month': {
      var first = new Date(+p[0], +p[1] - 2, 1), last = new Date(+p[0], +p[1] - 1, 0);
      var f = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
      return { from: f(first), to: f(last) };
    }
    default: return { from: cncDayPlus(today, -6), to: today };   // '7d'
  }
}

// → { summary, daily, hourly, paths, referrers, devices, langs, countries, signups } 또는 null (013 실행 전)
async function cncAdminVisitStats(from, to, noBots, noStaff) {
  var r = await sb.rpc('admin_visit_stats', { p_from: from, p_to: to, p_no_bots: !!noBots, p_no_staff: !!noStaff });
  if (r.error) {
    if (typeof cncIsMissingFunction === 'function' && cncIsMissingFunction(r.error)) return null;
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  var d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (!d) return null;
  var s = d.summary || {};
  var n = function (v) { return Number(v) || 0; };
  return {
    from: d.from, to: d.to,
    summary: { visits: n(s.visits), visitors: n(s.visitors), pageviews: n(s.pageviews), newVisitors: n(s.new_visitors), botVisits: n(s.bot_visits), staffVisits: n(s.staff_visits) },
    daily: (d.daily || []).map(function (x) { return { day: String(x.day).slice(0, 10), visits: n(x.visits), visitors: n(x.visitors), pageviews: n(x.pageviews), bots: n(x.bots), staff: n(x.staff) }; }),
    hourly: Array.isArray(d.hourly) ? d.hourly.map(function (x) { return { hour: n(x.hour), visits: n(x.visits), visitors: n(x.visitors) }; }) : null,
    paths: d.paths || [], referrers: d.referrers || [], devices: d.devices || [], langs: d.langs || [], countries: d.countries || [],
    signups: n(d.signups)
  };
}

// 들어온 곳 묶기: LINE · Google · Facebook · 직접(빈 값) · 기타 → [{ key: 'line'|'google'|'facebook'|'direct'|'other', n }]
function cncReferrerGroups(rows) {
  var acc = { line: 0, google: 0, facebook: 0, direct: 0, other: 0 };
  (rows || []).forEach(function (r) {
    var h = String(r.key || '').toLowerCase(), c = Number(r.n) || 0;
    if (!h) acc.direct += c;
    else if (h === 'line' || /(^|\.)line\.(me|naver\.jp)$/.test(h) || /^line\./.test(h)) acc.line += c;
    else if (/(^|\.)google\./.test(h)) acc.google += c;
    else if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h) || /^(m|l|lm)\.facebook\.com$/.test(h)) acc.facebook += c;
    else acc.other += c;
  });
  return Object.keys(acc).map(function (k) { return { key: k, n: acc[k] }; }).filter(function (x) { return x.n > 0; })
    .sort(function (a, b) { return b.n - a.n; });
}

// CSV (owner): 날짜별 방문 · 순 방문자 · 페이지뷰 · 로봇 · 직원 — 기존 규칙(UTF-8 BOM, 수식 주입 방지 cncCsvCell)
function cncVisitsCsv(daily, headers) {
  var lines = [headers.map(function (h) { return cncCsvCell(h, true); }).join(',')];
  (daily || []).forEach(function (r) {
    lines.push([cncCsvCell(r.day, true), r.visits, r.visitors, r.pageviews, r.bots, r.staff].join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
function cncVisitsCsvName(from, to) {
  return 'allabut-visits-' + from + (to && to !== from ? '_' + to : '') + '.csv';
}
