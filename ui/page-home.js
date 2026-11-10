// ===== 홈 (대시보드) #/home =====
// - 맨 위 "확인이 필요해요" 카드 (골드 테두리): 디자인 확인할 주문 · 수령 확인할 주문이 있을 때만
// - 작성 중인 주문이 있으면 노란 안내 바 (이어서 하기 / 삭제)
// - 그 아래 가이드 배너 (닫으면 작은 한 줄)
// - 인사말
// - 큰 카드 3개: 새 주문 / 크레딧 잔액 / 진행 중인 주문 수
// - 최근 주문 5개

var PageHome = {
  main: null,
  data: { recent: null, inProgress: null, todo: [], error: false },
  busy: {},           // 수령 확인 처리 중인 주문
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.data = { recent: null, inProgress: null, todo: [], error: false };
    this.draw();
    this.load();
    this.onBalance = this.draw.bind(this);
    window.addEventListener('balancechange', this.onBalance);
  },

  rerender: function () {
    this.draw();
  },

  leave: function () {
    this.loadToken++;
    if (this.onBalance) window.removeEventListener('balancechange', this.onBalance);
  },

  load: async function () {
    var token = ++this.loadToken;
    try {
      var results = await Promise.all([cncRecentOrders(5), cncCountInProgress(), refreshBalance(),
        cncOrdersNeedingAction().catch(function (err) { console.warn('todo load failed', err); return []; })]);
      if (token !== this.loadToken) return;
      this.data.recent = results[0];
      this.data.inProgress = results[1];
      this.data.todo = results[3] || [];
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.data.error = true;
    }
    this.draw();
  },

  draw: function () {
    if (!this.main) return;
    var p = APP.profile || {};
    var name = p.clinic_name || p.nickname || '';
    var d = this.data;
    var balance = APP.balance != null ? formatNumber(APP.balance) : '—';
    var inProgress = d.inProgress != null ? formatNumber(d.inProgress) : '—';

    var html = '<div class="page page-home">';

    // 확인이 필요해요 (맨 위)
    html += this.todoHtml();

    // 작성 중인 주문 안내 (Continue → 새 주문에서 이어서 / Discard → 확인 후 삭제)
    if (cncHasDraft(APP.user.id)) {
      html += '<div class="draft-bar" role="status">' +
        '<span class="draft-bar-text"><span aria-hidden="true">📝</span> ' + escHtml(t('draft_found')) + '</span>' +
        '<div class="draft-bar-actions">' +
          '<button type="button" class="btn btn-primary" onclick="PageHome.continueDraft()">' + escHtml(t('draft_continue_order')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
          '<button type="button" class="btn btn-outline btn-discard" onclick="PageHome.deleteDraft()">' + escHtml(t('draft_discard')) + '</button>' +
        '</div></div>';
    }

    // LINE 연결 안내 띠 (미연결 + 7일 숨김 아님). 작성 중 주문 안내 바 아래
    html += lineBannerHtml();

    // 🎁 무료 크레딧이 들어왔어요 (30일 이내, 닫으면 다시 안 보여요)
    html += this.freeNoticeHtml();

    // 가이드 배너 (✕ 로 닫으면 다음부터 작은 한 줄)
    if (this.guideBannerSmall()) {
      html += '<p class="guide-banner-small"><span aria-hidden="true">📖</span> <a href="#/guide">' + escHtml(t('guide_banner_small')) + '</a></p>';
    } else {
      html += '<div class="guide-banner">' +
        '<span class="guide-banner-icon" aria-hidden="true">📖</span>' +
        '<div class="guide-banner-text"><p class="guide-banner-title">' + escHtml(t('guide_banner_title')) + '</p>' +
          '<p class="muted">' + escHtml(t('guide_banner_desc')) + '</p></div>' +
        '<div class="guide-banner-actions">' +
          '<a href="#/guide" class="btn btn-gold">' + escHtml(t('guide_open')) + '</a>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="PageHome.hideGuideBanner()"><span aria-hidden="true">✕</span> ' + escHtml(t('btn_hide')) + '</button>' +
        '</div></div>';
    }

    html += '<h1 class="page-title">' + escHtml(tf('home_welcome', { name: name })) + '</h1>' +
      '<p class="page-desc">' + escHtml(t('home_subtitle')) + '</p>';

    // 큰 카드 3개
    html += '<div class="home-cards">' +
      '<a href="#/new" class="home-card home-card-new">' +
        '<span class="home-card-label">' + escHtml(t('home_new_order')) + '</span>' +
        '<span class="home-card-desc">' + escHtml(t('home_new_order_desc')) + '</span>' +
        '<span class="home-card-arrow arrow" aria-hidden="true">→</span>' +
      '</a>' +
      '<div class="home-card home-card-credits">' +
        '<a href="#/profile" class="home-card-link">' +
          '<span class="home-card-label">' + escHtml(t('home_credits')) + '</span>' +
          '<span class="home-card-number mono">' + balance + '</span>' +
          '<span class="home-card-desc">' + escHtml(t('credit_rule')) + '</span>' +
          this.expiringHtml() +
        '</a>' +
        '<a href="#/topup" class="btn btn-gold btn-sm home-topup-btn">' + escHtml(t('topup_btn')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
      '</div>' +
      '<a href="#/orders" class="home-card">' +
        '<span class="home-card-label">' + escHtml(t('home_in_progress')) + '</span>' +
        '<span class="home-card-number mono">' + inProgress + '</span>' +
        '<span class="home-card-desc">' + escHtml(t('home_in_progress_desc')) + '</span>' +
      '</a>' +
    '</div>';

    // 최근 주문
    html += '<section class="card">' +
      '<div class="card-head">' +
        '<h2 class="card-title">' + escHtml(t('home_recent')) + '</h2>' +
        '<a href="#/orders" class="btn btn-outline btn-sm">' + escHtml(t('view_all')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
      '</div>';

    if (d.error) {
      html += '<p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageHome.load()">' + escHtml(t('btn_retry')) + '</button>' + uiContactHelpHtml();
    } else if (d.recent === null) {
      html += uiLoading();
    } else if (!d.recent.length) {
      html += '<p class="empty-text">' + escHtml(t('orders_empty')) + '</p>';
    } else {
      html += '<ul class="order-list">' + d.recent.map(function (o) {
        return '<li><a href="#/orders" class="order-row" onclick="PageOrders.openId=\'' + escHtml(o.id) + '\'">' +
          '<span class="order-row-id mono">' + escHtml(o.id) + '</span>' +
          '<span class="order-row-meta">' + escHtml(formatDate(o.created_at)) + ' · ' +
            escHtml(o.patient || t('anonymous')) + ' · ' + escHtml(tf('teeth_count_fmt', { n: o.teeth_count })) + '</span>' +
          uiStageBadge(o.stage) +
          '</a></li>';
      }).join('') + '</ul>';
    }
    html += '</section></div>';
    this.main.innerHTML = html;
  },

  // ----- 확인이 필요해요 -----
  // 🎁 무료 크레딧 n개가 들어왔어요 (유효기간 ~날짜) — 묶음마다 한 줄
  freeNoticeHtml: function () {
    var list = cncNewFreeLots(APP.lots);
    if (!list.length) return '';
    return '<div class="free-added" id="free-added" role="status">' +
      list.map(function (x) {
        return '<p class="free-added-line"><span aria-hidden="true">🎁</span> ' +
          escHtml(tf('free_added_notice', { n: formatNumber(x.n), date: formatDate(x.expires_at) })) +
          (x.event_name ? ' <span class="free-added-event">· ' + escHtml(x.event_name) + '</span>' : '') + '</p>';
      }).join('') +
      '<p class="field-help">' + escHtml(t('free_rule_short')) + '</p>' +
      '<div class="btn-row">' +
        '<a href="#/new" class="btn btn-gold">' + escHtml(t('home_new_order')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageHome.hideFreeNotice()"><span aria-hidden="true">✕</span> ' + escHtml(t('btn_hide')) + '</button>' +
      '</div></div>';
  },

  hideFreeNotice: function () {
    cncMarkFreeSeen(cncNewFreeLots(APP.lots).map(function (x) { return x.id; }));
    this.draw();
  },

  todoHtml: function () {
    var self = this;
    var list = this.data.todo || [];
    if (!list.length) return '';
    return '<section class="home-todo" aria-labelledby="home-todo-title">' +
      '<h2 class="home-todo-title" id="home-todo-title"><span aria-hidden="true">🔔</span> ' + escHtml(t('home_todo_title')) + '</h2>' +
      '<ul class="home-todo-list">' + list.map(function (o) {
        var id = escHtml(o.id);
        var busy = !!self.busy[o.id];
        var isDesign = o.stage === 'design_ready';
        return '<li class="home-todo-item">' +
          '<div class="home-todo-text">' +
            '<p class="home-todo-msg">' + escHtml(t(isDesign ? 'home_todo_design' : 'home_todo_receive')) + '</p>' +
            '<p class="home-todo-meta"><span class="mono">' + id + '</span> · ' + escHtml(o.patient || '—') + ' · ' + escHtml(tf('teeth_count_fmt', { n: o.teeth_count })) + '</p>' +
          '</div>' +
          (isDesign
            ? '<button type="button" class="btn btn-primary" onclick="PageHome.openDesign(\'' + id + '\')">' + escHtml(t('home_todo_view_design')) + ' <span class="arrow" aria-hidden="true">→</span></button>'
            : '<button type="button" class="btn btn-primary" onclick="PageHome.receive(\'' + id + '\')"' + (busy ? ' disabled' : '') + '>' + escHtml(busy ? t('admin_processing') : t('todo_receive_btn')) + '</button>') +
          '</li>';
      }).join('') + '</ul></section>';
  },

  // 디자인 보기 → 내 주문에서 그 주문을 펼쳐서 바로 보여줘요
  openDesign: function (id) {
    PageOrders.openId = id;
    PageOrders.tab = 'progress';
    navigate('orders');
  },

  // 수령 확인 (확인창 → 처리 → 목록 새로)
  receive: async function (id) {
    if (this.busy[id]) return;
    var ok = await uiConfirm({ title: t('receive_btn'), message: t('receive_confirm_msg'), okLabel: t('receive_btn') });
    if (!ok) return;
    this.busy[id] = true;
    this.draw();
    try {
      await cncCustomerAction(id, 'receive');
      uiToast(t('received_msg'), 'success');
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
    delete this.busy[id];
    this.load();
  },

  // 크레딧 카드: "n크레딧이 m일 후 만료" (30일 이내 만료 예정이 있을 때만, 주황)
  expiringHtml: function () {
    var x = cncExpiringSummary(APP.lots);
    if (!x) return '';
    return '<span class="home-card-warn"><span aria-hidden="true">⏳</span> ' + escHtml(tf('home_expiring_fmt', { n: formatNumber(x.credits), d: x.days })) + '</span>';
  },

  continueDraft: function () {
    PageNew.resumeRequested = true;
    navigate('new');
  },

  deleteDraft: async function () {
    var ok = await uiConfirm({ title: t('draft_discard'), message: t('draft_discard_confirm'), okLabel: t('draft_discard'), danger: true });
    if (!ok) return;
    cncClearDraft(APP.user.id);
    if (window.PageNew) { PageNew.draft = null; PageNew.locked = false; PageNew.pendingDraft = null; }
    this.draw();
  },

  GUIDE_BANNER_KEY: 'allabut_guide_banner_small',

  guideBannerSmall: function () {
    try { return localStorage.getItem(this.GUIDE_BANNER_KEY) === '1'; } catch (e) { return false; }
  },

  hideGuideBanner: function () {
    try { localStorage.setItem(this.GUIDE_BANNER_KEY, '1'); } catch (e) { /* 무시 */ }
    this.draw();
  }
};
