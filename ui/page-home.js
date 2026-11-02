// ===== 홈 (대시보드) #/home =====
// - 작성 중인 주문이 있으면 맨 위 노란 안내 바 (이어서 하기 / 삭제)
// - 인사말
// - 큰 카드 3개: 새 주문 / 크레딧 잔액 / 진행 중인 주문 수
// - 최근 주문 5개

var PageHome = {
  main: null,
  data: { recent: null, inProgress: null, error: false },
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.data = { recent: null, inProgress: null, error: false };
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
      var results = await Promise.all([cncRecentOrders(5), cncCountInProgress(), refreshBalance()]);
      if (token !== this.loadToken) return;
      this.data.recent = results[0];
      this.data.inProgress = results[1];
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

    // 작성 중인 주문 안내
    if (cncHasDraft(APP.user.id)) {
      html += '<div class="draft-bar" role="status">' +
        '<span class="draft-bar-text"><span aria-hidden="true">📝</span> ' + escHtml(t('draft_found')) + '</span>' +
        '<div class="draft-bar-actions">' +
          '<a href="#/new" class="btn btn-primary">' + escHtml(t('draft_continue')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
          '<button type="button" class="btn btn-outline" onclick="PageHome.deleteDraft()">' + escHtml(t('draft_delete')) + '</button>' +
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
      '<a href="#/profile" class="home-card">' +
        '<span class="home-card-label">' + escHtml(t('home_credits')) + '</span>' +
        '<span class="home-card-number mono">' + balance + '</span>' +
        '<span class="home-card-desc">' + escHtml(t('credit_rule')) + '</span>' +
      '</a>' +
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
        '<button type="button" class="btn btn-outline" onclick="PageHome.load()">' + escHtml(t('btn_retry')) + '</button>';
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

  deleteDraft: async function () {
    var ok = await uiConfirm({ title: t('draft_delete'), message: t('draft_delete_confirm'), okLabel: t('draft_delete'), danger: true });
    if (!ok) return;
    cncClearDraft(APP.user.id);
    if (window.PageNew) PageNew.draft = null;
    this.draw();
  }
};
