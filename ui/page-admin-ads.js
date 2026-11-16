// ===== 관리자: 📢 광고 배너 (sql/019) — PageAdmin 에 덧붙여요 =====
// Settings → "📢 광고 배너" (manager 이상): 목록(자리 · 이름 · 광고주 · 기간 · 상태 · 노출 · 클릭 · 클릭률) + 추가/수정 창 + 삭제(확인창)
//   - 상태 배지: 꺼짐 / 예정 / 노출 중 / 종료 (cncAdStatus, 방콕 날짜)
//   - 추가/수정: 이름(필수) · 광고주 · 자리 · PC 이미지(필수) · 휴대폰 이미지(선택, 없으면 PC 이미지) — 올리기 + 미리보기 · 링크(https 만) · 대체 글자 ·
//     시작일 · 종료일(uiDateField, 비우면 무기한) · 순서 · 켜기
// Dashboard → 방문 통계 아래 작은 "광고" 카드 (manager 이상): 기간별 배너마다 노출 · 클릭 · 클릭률, CSV(owner)
// 실제 권한 · 검사는 DB 함수 (admin_list_ad_banners · admin_save_ad_banner · admin_delete_ad_banner · admin_ad_stats)

Object.assign(PageAdmin, {
  ads: { rows: null, error: null, missing: false },
  adStats: { range: '7d', data: null, error: null, missing: false, loading: false },

  // ================================================================
  // Settings: 📢 광고 배너
  // ================================================================
  adsSectionHtml: function () {
    if (!cncHasRole('manager')) return '';
    return '<section class="card ads-admin" id="ads-admin"></section>';
  },

  loadAds: async function () {
    var st = this.ads;
    st.error = null;
    this.drawAds();
    try {
      var rows = await cncAdminListBanners();
      st.missing = rows === null;
      st.rows = rows || [];
    } catch (err) {
      console.error(err);
      st.error = err;
    }
    this.drawAds();
  },

  drawAds: function () {
    var box = document.getElementById('ads-admin');
    if (!box) return;
    var st = this.ads;
    var html = '<div class="card-head"><h2 class="card-title">📢 ' + escHtml(t('ad_admin_title')) + '</h2>' +
      (st.missing ? '' : '<button type="button" class="btn btn-outline" onclick="PageAdmin.openAdEditor(null)">+ ' + escHtml(t('ad_add')) + '</button>') + '</div>' +
      '<p class="card-desc">' + escHtml(t('ad_admin_help')) + '</p>';
    if (st.missing) {
      box.innerHTML = html + '<p class="notice notice-warn">' + escHtml(t('ad_missing')) + '</p>';
      return;
    }
    if (st.error) {
      box.innerHTML = html + '<p class="error-text">' + escHtml(uiErrorMessage(st.error)) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadAds()">' + escHtml(t('btn_retry')) + '</button>';
      return;
    }
    if (st.rows === null) { box.innerHTML = html + uiLoading(); return; }
    if (!st.rows.length) { box.innerHTML = html + '<p class="empty-text">' + escHtml(t('ad_empty')) + '</p>'; return; }
    var self = this;
    html += '<div class="table-wrap"><table class="table ads-table"><thead><tr>' +
      '<th>' + escHtml(t('ad_slot')) + '</th><th>' + escHtml(t('ad_name')) + '</th><th>' + escHtml(t('ad_advertiser')) + '</th>' +
      '<th>' + escHtml(t('ad_period')) + '</th><th>' + escHtml(t('col_status')) + '</th>' +
      '<th class="num">' + escHtml(t('ad_views')) + '</th><th class="num">' + escHtml(t('ad_clicks')) + '</th><th class="num">' + escHtml(t('ad_ctr')) + '</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (b) {
        var ctr = cncAdCtr(b.views, b.clicks);
        return '<tr data-ad-row="' + Number(b.id) + '">' +
          '<td class="nowrap">' + escHtml(t('ad_slot_' + b.slot)) + '</td>' +
          '<td><b>' + escHtml(b.name) + '</b></td>' +
          '<td>' + escHtml(b.advertiser || '—') + '</td>' +
          '<td class="nowrap">' + self.adPeriodHtml(b) + '</td>' +
          '<td>' + self.adStatusBadge(b) + '</td>' +
          '<td class="num mono">' + formatNumber(b.views || 0) + '</td>' +
          '<td class="num mono">' + formatNumber(b.clicks || 0) + '</td>' +
          '<td class="num mono">' + (ctr == null ? '—' : escHtml(ctr.toFixed(1) + '%')) + '</td>' +
          '<td class="nowrap"><button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.openAdEditor(' + Number(b.id) + ')">' + escHtml(t('btn_edit')) + '</button> ' +
            '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageAdmin.deleteAd(' + Number(b.id) + ')">' + escHtml(t('ad_delete')) + '</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
    box.innerHTML = html;
  },

  adPeriodHtml: function (b) {
    var s = b.starts_at ? formatDate(String(b.starts_at).slice(0, 10)) : '';
    var e = b.ends_at ? formatDate(String(b.ends_at).slice(0, 10)) : '';
    if (!s && !e) return escHtml(t('ad_always'));
    return escHtml((s || '…') + ' ~ ' + (e || t('ad_no_end')));
  },

  adStatusBadge: function (b) {
    var st = cncAdStatus(b);
    return '<span class="badge ad-status ad-status-' + st + '">' + escHtml(t('ad_status_' + st)) + '</span>';
  },

  // 추가 / 수정 창
  openAdEditor: function (id) {
    var self = this;
    var b = id ? (this.ads.rows || []).filter(function (x) { return Number(x.id) === Number(id); })[0] : null;
    if (id && !b) return;
    b = b || { id: null, name: '', advertiser: '', slot: 'home', image_desktop_url: '', image_mobile_url: '', link_url: 'https://', alt_text: '', starts_at: null, ends_at: null, active: false, sort_order: 0 };
    var files = { desktop: null, mobile: null };
    var urls = { desktop: b.image_desktop_url || '', mobile: b.image_mobile_url || '' };

    function previewHtml(kind) {
      var src = files[kind] ? URL.createObjectURL(files[kind]) : cncAdSafeUrl(urls[kind]);
      return src ? '<img class="ad-preview-img ad-preview-' + kind + '" src="' + escHtml(src) + '" alt="">' : '<p class="muted ad-preview-empty">' + escHtml(t('ad_no_image')) + '</p>';
    }
    function imageField(kind, required) {
      return '<div class="field span-2 ad-image-field"><span class="field-label">' + escHtml(t('ad_image_' + kind)) +
          (required ? ' <span class="required">*</span>' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</span>' +
        '<p class="field-help">' + escHtml(t('ad_image_' + kind + '_help')) + '</p>' +
        '<div class="ad-preview" id="ad-prev-' + kind + '">' + previewHtml(kind) + '</div>' +
        '<div class="btn-row"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'ad-file-' + kind + '\').click()">' + escHtml(t('ad_choose_image')) + '</button>' +
          (kind === 'mobile' ? '<button type="button" class="btn btn-outline btn-sm" id="ad-clear-mobile">' + escHtml(t('ad_clear_image')) + '</button>' : '') + '</div>' +
        '<input type="file" id="ad-file-' + kind + '" accept="image/jpeg,image/png,image/webp" hidden>' +
        '<div class="err-slot" data-ad-err="image_' + kind + '"></div></div>';
    }
    function opt(v) { return '<option value="' + v + '"' + (b.slot === v ? ' selected' : '') + '>' + escHtml(t('ad_slot_' + v)) + '</option>'; }

    var body = '<div class="form-grid two ad-form">' +
      '<div class="field"><label class="field-label" for="ad-name">' + escHtml(t('ad_name')) + ' <span class="required">*</span></label>' +
        '<input class="input" id="ad-name" maxlength="100" value="' + escHtml(b.name) + '"><div class="err-slot" data-ad-err="name"></div></div>' +
      '<div class="field"><label class="field-label" for="ad-advertiser">' + escHtml(t('ad_advertiser')) + '</label>' +
        '<input class="input" id="ad-advertiser" maxlength="100" value="' + escHtml(b.advertiser) + '"></div>' +
      '<div class="field"><label class="field-label" for="ad-slot">' + escHtml(t('ad_slot')) + '</label>' +
        '<select class="input" id="ad-slot">' + AD_SLOTS.map(opt).join('') + '</select><p class="field-help">' + escHtml(t('ad_slot_help')) + '</p></div>' +
      '<div class="field"><label class="field-label" for="ad-order">' + escHtml(t('admin_pkg_order')) + '</label>' +
        '<input class="input mono" id="ad-order" type="number" step="1" value="' + escHtml(String(b.sort_order || 0)) + '"></div>' +
      imageField('desktop', true) + imageField('mobile', false) +
      '<div class="field span-2"><label class="field-label" for="ad-link">' + escHtml(t('ad_link')) + ' <span class="required">*</span></label>' +
        '<input class="input" id="ad-link" type="url" maxlength="1000" value="' + escHtml(b.link_url) + '" placeholder="https://"><p class="field-help">' + escHtml(t('ad_link_help')) + '</p>' +
        '<div class="err-slot" data-ad-err="link"></div></div>' +
      '<div class="field span-2"><label class="field-label" for="ad-alt">' + escHtml(t('ad_alt')) + '</label>' +
        '<input class="input" id="ad-alt" maxlength="200" value="' + escHtml(b.alt_text) + '"><p class="field-help">' + escHtml(t('ad_alt_help')) + '</p></div>' +
      '<div class="field"><span class="field-label">' + escHtml(t('ad_starts')) + '</span>' + uiDateField({ id: 'ad-starts', value: b.starts_at ? String(b.starts_at).slice(0, 10) : '' }) + '</div>' +
      '<div class="field"><span class="field-label">' + escHtml(t('ad_ends')) + '</span>' + uiDateField({ id: 'ad-ends', value: b.ends_at ? String(b.ends_at).slice(0, 10) : '' }) +
        '<div class="err-slot" data-ad-err="dates"></div></div>' +
      '<p class="field-help span-2">' + escHtml(t('ad_dates_help')) + '</p>' +
      '<label class="checkbox span-2"><input type="checkbox" id="ad-active"' + (b.active ? ' checked' : '') + '> <span>' + escHtml(t('ad_active')) + '</span></label>' +
      '</div>';

    var modal = uiModal({
      title: '📢 ' + (b.id ? t('ad_edit') : t('ad_add')),
      wide: true,
      body: body,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('pe_save'), kind: 'primary', onClick: async function (close, btn) {
          var el = modal.el;
          var v = function (x) { return el.querySelector('#ad-' + x).value.trim(); };
          var data = {
            id: b.id, name: v('name'), advertiser: v('advertiser'), slot: v('slot'), sort_order: v('order'),
            link_url: v('link'), alt_text: v('alt'), starts_at: uiDateValue('ad-starts') || null, ends_at: uiDateValue('ad-ends') || null,
            active: el.querySelector('#ad-active').checked
          };
          var errs = {};
          if (!data.name) errs.name = 'err_required';
          if (!cncAdSafeUrl(data.link_url)) errs.link = 'ad_err_link';
          if (!files.desktop && !cncAdSafeUrl(urls.desktop)) errs.image_desktop = 'ad_err_image_required';
          if (data.starts_at && data.ends_at && data.starts_at > data.ends_at) errs.dates = 'ad_err_dates';
          var slots = el.querySelectorAll('[data-ad-err]');
          for (var i = 0; i < slots.length; i++) slots[i].innerHTML = uiFieldError(errs[slots[i].getAttribute('data-ad-err')]);
          if (Object.keys(errs).length) return;
          btn.disabled = true;
          try {
            data.image_desktop_url = files.desktop ? await cncAdminUploadAdImage(files.desktop) : urls.desktop;
            data.image_mobile_url = files.mobile ? await cncAdminUploadAdImage(files.mobile) : urls.mobile;
            await cncAdminSaveBanner(data);
            close();
            uiToast(t('ad_saved'), 'success');
            self.loadAds();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(self.adErrorText(err), 'error');
          }
        } }
      ]
    });
    // 이미지 고르기 → 검사 → 미리보기
    ['desktop', 'mobile'].forEach(function (kind) {
      var input = modal.el.querySelector('#ad-file-' + kind);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        var bad = cncCheckAdImage(f);
        modal.el.querySelector('[data-ad-err="image_' + kind + '"]').innerHTML = uiFieldError(bad);
        if (bad) return;
        files[kind] = f;
        modal.el.querySelector('#ad-prev-' + kind).innerHTML = previewHtml(kind);
      });
    });
    var clr = modal.el.querySelector('#ad-clear-mobile');
    if (clr) clr.addEventListener('click', function () {
      files.mobile = null; urls.mobile = '';
      modal.el.querySelector('#ad-prev-mobile').innerHTML = previewHtml('mobile');
    });
  },

  adErrorText: function (err) {
    var map = { INVALID_URL: 'ad_err_link', NAME_REQUIRED: 'err_required', IMAGE_REQUIRED: 'ad_err_image_required', INVALID_DATES: 'ad_err_dates', INVALID_SLOT: 'ad_err_slot' };
    var msg = String((err && (err.message || (err.cause && err.cause.message))) || '');
    for (var k in map) if (msg.indexOf(k) !== -1) return t(map[k]);
    if (err && err.code === 'UPLOAD_FAILED') return t('ad_err_upload');
    return uiErrorMessage(err);
  },

  deleteAd: async function (id) {
    var b = (this.ads.rows || []).filter(function (x) { return Number(x.id) === Number(id); })[0];
    if (!b) return;
    var ok = await uiConfirm({ title: t('ad_delete'), message: tf('ad_delete_confirm', { name: b.name }), okLabel: t('ad_delete'), danger: true });
    if (!ok) return;
    try {
      await cncAdminDeleteBanner(b);
      uiToast(t('ad_deleted'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    this.loadAds();
  },

  // ================================================================
  // Dashboard: 광고 카드 (방문 통계 아래)
  // ================================================================
  AD_RANGES: ['today', '7d', '30d', 'month', 'last_month'],

  adRangeDates: function (range) {
    var today = cncBangkokToday();
    var p = today.split('-');
    if (range === 'today') return { from: today, to: today };
    if (range === '30d') return { from: cncDatePlus(today, -29), to: today };
    if (range === 'month') return { from: p[0] + '-' + p[1] + '-01', to: today };
    if (range === 'last_month') {
      var d = new Date(+p[0], +p[1] - 2, 1), e = new Date(+p[0], +p[1] - 1, 0);
      var f = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
      return { from: f(d), to: f(e) };
    }
    return { from: cncDatePlus(today, -6), to: today };
  },

  adStatsHtml: function () {
    if (!cncHasRole('manager')) return '';
    return '<section class="dash-section dash-ads" id="dash-ads">' + this.adStatsInnerHtml() + '</section>';
  },

  adStatsInnerHtml: function () {
    var st = this.adStats;
    var self = this;
    var head = '<div class="dash-ads-head"><h2 class="dash-section-title">📢 ' + escHtml(t('ad_dash_title')) + '</h2>' +
      '<div class="seg ad-range" role="group">' + this.AD_RANGES.map(function (r) {
        return '<button type="button" class="seg-btn' + (st.range === r ? ' active' : '') + '" onclick="PageAdmin.setAdRange(\'' + r + '\')">' + escHtml(t('vs_range_' + r)) + '</button>';
      }).join('') + '</div>' +
      (cncHasRole('owner') && st.data && st.data.rows.length ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageAdmin.downloadAdCsv()">CSV</button>' : '') + '</div>';
    if (st.missing) return head + '<p class="muted">' + escHtml(t('ad_missing')) + '</p>';
    if (st.error) return head + '<p class="error-text">' + escHtml(uiErrorMessage(st.error)) + '</p>';
    if (!st.data) return head + uiLoading();
    if (!st.data.rows.length) return head + '<p class="muted">' + escHtml(t('ad_dash_empty')) + '</p>';
    return head + '<div class="table-wrap"><table class="table admin-table-plain ads-stats-table"><thead><tr>' +
      '<th>' + escHtml(t('ad_name')) + '</th><th>' + escHtml(t('ad_slot')) + '</th>' +
      '<th class="num">' + escHtml(t('ad_views')) + '</th><th class="num">' + escHtml(t('ad_clicks')) + '</th><th class="num">' + escHtml(t('ad_ctr')) + '</th></tr></thead><tbody>' +
      st.data.rows.map(function (r) {
        var ctr = cncAdCtr(r.views, r.clicks);
        return '<tr><td>' + escHtml(r.name) + (r.deleted ? ' <span class="badge">' + escHtml(t('ad_deleted_badge')) + '</span>' : '') +
            (r.advertiser ? ' <span class="muted">· ' + escHtml(r.advertiser) + '</span>' : '') + '</td>' +
          '<td class="nowrap">' + escHtml(r.slot ? t('ad_slot_' + r.slot) : '—') + '</td>' +
          '<td class="num mono">' + formatNumber(r.views || 0) + '</td><td class="num mono">' + formatNumber(r.clicks || 0) + '</td>' +
          '<td class="num mono">' + (ctr == null ? '—' : escHtml(ctr.toFixed(1) + '%')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  drawAdStats: function () {
    var box = document.getElementById('dash-ads');
    if (box) box.innerHTML = this.adStatsInnerHtml();
  },

  loadAdStats: async function () {
    if (!cncHasRole('manager')) return;
    var st = this.adStats;
    var r = this.adRangeDates(st.range);
    st.error = null; st.data = null; st.loading = true;
    this.drawAdStats();
    try {
      var d = await cncAdminAdStats(r.from, r.to);
      st.missing = d === null;
      st.data = d;
    } catch (err) {
      console.error(err);
      st.error = err;
    }
    st.loading = false;
    this.drawAdStats();
  },

  setAdRange: function (range) {
    this.adStats.range = this.AD_RANGES.indexOf(range) !== -1 ? range : '7d';
    this.loadAdStats();
  },

  downloadAdCsv: function () {
    var d = this.adStats.data;
    if (!d || !cncHasRole('owner')) return;
    var headers = [t('ad_csv_from'), t('ad_csv_to'), t('ad_slot'), t('ad_name'), t('ad_advertiser'), t('ad_views'), t('ad_clicks'), t('ad_ctr')];
    cncDownloadText(cncAdStatsCsv(d, headers), cncAdStatsCsvName(d.from, d.to));
  }
});
