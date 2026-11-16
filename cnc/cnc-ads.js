// ================================================================
// allAbut — 광고 배너 (로직만, 화면 코드 없음) — DB: sql/019_shade_and_ad_banners.sql
// ================================================================
// 자체 배너만 (외부 광고 스크립트 · 추적 코드 없음)
//   자리: 'landing'(랜딩 슬로건 아래) · 'home'(고객 홈 크레딧 카드 아래) · 'order_done'(주문 완료 안내 아래)
//   새 주문 작성 중 · 충전 결제 · 관리자 화면에는 넣지 않아요
//   노출 · 클릭 기록: site_events 'ad_view' · 'ad_click' (+ 배너 번호) — cncSendEvent(cnc/cnc-analytics.js)
//   이미지: 공개 버킷 'ad-banners' (jpg · png · webp, 2MB, 올리기 · 지우기는 manager 이상)
// 링크 · 이미지 주소는 https 만 (DB 도 같은 규칙으로 막아요)

var AD_SLOTS = ['landing', 'home', 'order_done'];
var AD_BUCKET = 'ad-banners';
var AD_MAX_BYTES = 2 * 1024 * 1024;
var AD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var AD_ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'];
var AD_CACHE_MS = 5 * 60 * 1000;   // 노출 중인 배너 목록은 5분 동안 기억

// https 주소만 → 아니면 ''
function cncAdSafeUrl(url) {
  var v = String(url || '').trim();
  return /^https:\/\/[^\s/]+/i.test(v) && v.length <= 1000 ? v : '';
}

// ----------------------------------------------------------------
// 고객 화면: 지금 노출 중인 배너
// ----------------------------------------------------------------
var _adCache = null;   // { at, rows }
var _adLoading = null;

// 모든 자리의 노출 중인 배너를 한 번에 읽어 기억 (019 전 · 오류면 [] → 자리 자체가 안 생겨요)
function cncLoadActiveBanners(force) {
  if (!force && _adCache && Date.now() - _adCache.at < AD_CACHE_MS) return Promise.resolve(_adCache.rows);
  if (_adLoading) return _adLoading;
  _adLoading = (async function () {
    var rows = [];
    try {
      var r = await sb.rpc('get_active_ad_banners', {});
      if (!r.error) {
        var d = r.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = []; } }
        rows = (Array.isArray(d) ? d : []).filter(function (b) {
          return b && AD_SLOTS.indexOf(b.slot) !== -1 && cncAdSafeUrl(b.image_desktop_url) && cncAdSafeUrl(b.link_url);
        }).sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) - Number(b.id)); });
      }
    } catch (err) {
      rows = [];
    }
    _adCache = { at: Date.now(), rows: rows };
    _adLoading = null;
    return rows;
  })();
  return _adLoading;
}

// 이미 읽어 둔 것만 바로 (없으면 null) — 다시 그릴 때 깜빡이지 않게
function cncCachedBanners(slot) {
  if (!_adCache) return null;
  return _adCache.rows.filter(function (b) { return b.slot === slot; });
}

async function cncGetActiveBanners(slot) {
  var rows = await cncLoadActiveBanners(false);
  return rows.filter(function (b) { return b.slot === slot; });
}

// 노출 · 클릭 기록 (실패해도 조용히)
function cncTrackAd(kind, bannerId) {
  if (kind !== 'ad_view' && kind !== 'ad_click') return Promise.resolve(false);
  var path = (typeof cncNormPath === 'function') ? cncNormPath(location.hash) : '';
  if (document.getElementById('screen-landing') && document.getElementById('screen-landing').classList.contains('active')) path = '/landing';
  return typeof cncSendEvent === 'function' ? cncSendEvent(kind, path, bannerId) : Promise.resolve(false);
}

// ----------------------------------------------------------------
// 관리자 (manager 이상)
// ----------------------------------------------------------------
// 상태: 'off'(꺼짐) / 'scheduled'(예정) / 'live'(노출 중) / 'ended'(종료) — 방콕 날짜 기준
function cncAdStatus(b) {
  if (!b || !b.active) return 'off';
  var today = typeof cncBangkokToday === 'function' ? cncBangkokToday() : new Date().toISOString().slice(0, 10);
  if (b.ends_at && String(b.ends_at).slice(0, 10) < today) return 'ended';
  if (b.starts_at && String(b.starts_at).slice(0, 10) > today) return 'scheduled';
  return 'live';
}

// 클릭률 % (노출 0 이면 null)
function cncAdCtr(views, clicks) {
  views = Number(views) || 0; clicks = Number(clicks) || 0;
  if (!views) return null;
  return Math.round(clicks / views * 1000) / 10;
}

// 전체 목록 (+ 누적 노출 · 클릭). 019 전이면 null
async function cncAdminListBanners() {
  var r = await sb.rpc('admin_list_ad_banners');
  if (r.error) {
    if (typeof cncIsMissingFunction === 'function' && cncIsMissingFunction(r.error)) return null;
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  var d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = []; } }
  return Array.isArray(d) ? d : [];
}

// 저장 (id 가 없으면 추가) → 배너 id
async function cncAdminSaveBanner(b) {
  var id = await cncRpc('admin_save_ad_banner', {
    p_id: b.id || null,
    p_name: String(b.name || '').trim(),
    p_advertiser: String(b.advertiser || '').trim(),
    p_slot: AD_SLOTS.indexOf(b.slot) !== -1 ? b.slot : 'home',
    p_image_desktop_url: String(b.image_desktop_url || '').trim(),
    p_image_mobile_url: String(b.image_mobile_url || '').trim(),
    p_link_url: String(b.link_url || '').trim(),
    p_alt_text: String(b.alt_text || '').trim(),
    p_starts_at: b.starts_at || null,
    p_ends_at: b.ends_at || null,
    p_active: !!b.active,
    p_sort_order: parseInt(b.sort_order, 10) || 0
  });
  _adCache = null;   // 고객 화면 목록도 새로
  return id;
}

async function cncAdminDeleteBanner(b) {
  await cncRpc('admin_delete_ad_banner', { p_id: b.id });
  _adCache = null;
  // 우리 버킷에 올린 이미지면 같이 지워요 (실패해도 괜찮아요)
  var paths = [b.image_desktop_url, b.image_mobile_url].map(cncAdBucketPath).filter(Boolean);
  if (paths.length) { try { await sb.storage.from(AD_BUCKET).remove(paths); } catch (e) { /* 무시 */ } }
}

// 공개 주소 → 버킷 안 경로 ('…/object/public/ad-banners/banners/x.png' → 'banners/x.png'), 다른 주소면 ''
function cncAdBucketPath(url) {
  var m = /\/storage\/v1\/object\/public\/ad-banners\/(.+)$/.exec(String(url || ''));
  return m ? decodeURIComponent(m[1].split('?')[0]) : '';
}

// 이미지 검사: '' 면 OK, 아니면 에러 번역 키
function cncCheckAdImage(file) {
  if (!file) return 'ad_err_image_required';
  var ext = (typeof fileExt === 'function') ? fileExt(file.name) : String(file.name || '').split('.').pop().toLowerCase();
  if (AD_ALLOWED_EXT.indexOf(ext) === -1 || (file.type && AD_ALLOWED_TYPES.indexOf(file.type) === -1)) return 'ad_err_image_type';
  if (!file.size || file.size > AD_MAX_BYTES) return 'ad_err_image_size';
  return '';
}

// 이미지 올리기 → 공개 주소 (https)
async function cncAdminUploadAdImage(file) {
  var bad = cncCheckAdImage(file);
  if (bad) throw cncError('INVALID_AMOUNT', { key: bad });
  var safe = typeof cncSafeFileName === 'function' ? cncSafeFileName(file.name) : 'banner.png';
  var path = 'banners/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) + '_' + safe;
  var up;
  try {
    up = await sb.storage.from(AD_BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'image/png' });
  } catch (err) {
    throw cncError('UPLOAD_FAILED', { fileName: file.name, cause: err });
  }
  if (up.error) throw cncError('UPLOAD_FAILED', { fileName: file.name, cause: up.error });
  var pub = sb.storage.from(AD_BUCKET).getPublicUrl(path);
  var url = pub && pub.data ? pub.data.publicUrl : '';
  return cncAdSafeUrl(url) || url;
}

// 기간(방콕 날짜) 배너마다 노출 · 클릭 → { from, to, rows: [{ id, name, advertiser, slot, deleted, views, clicks }] } (019 전이면 null)
async function cncAdminAdStats(from, to) {
  var r = await sb.rpc('admin_ad_stats', { p_from: from, p_to: to });
  if (r.error) {
    if (typeof cncIsMissingFunction === 'function' && cncIsMissingFunction(r.error)) return null;
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  var d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  return d && Array.isArray(d.rows) ? d : { from: from, to: to, rows: [] };
}

// CSV (owner) — 기존 CSV 규칙 (UTF-8 BOM, cncCsvCell 로 수식 주입 방지)
function cncAdStatsCsv(stats, headers) {
  var lines = [headers.map(function (h) { return cncCsvCell(h, true); }).join(',')];
  (stats.rows || []).forEach(function (r) {
    var ctr = cncAdCtr(r.views, r.clicks);
    lines.push([
      cncCsvCell(stats.from, true), cncCsvCell(stats.to, true),
      cncCsvCell(r.slot || '', true), cncCsvCell(r.name || '', true), cncCsvCell(r.advertiser || '', true),
      cncCsvCell(r.views), cncCsvCell(r.clicks), ctr == null ? '' : ctr.toFixed(1)
    ].join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function cncAdStatsCsvName(from, to) {
  return 'allabut-ads-' + from + (to && to !== from ? '_' + to : '') + '.csv';
}
