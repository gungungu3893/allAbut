// ===== 자체 달력 (날짜 선택) =====
// 브라우저 기본 <input type="date"> 는 브라우저 언어를 따라가서, 앱에서 영어를 골라도 "연도-월-일" 같은 모양으로 나와요.
// 그래서 앱 언어(currentLang)를 따르는 달력을 직접 만들었어요.
//
// 사용법 (HTML 글자로 넣기):
//   uiDateField({ id: 'f-deadline', value: '2026-11-20', min: cncToday(), onChange: 'PageNew.setDeadline', invalid: false })
//   → 큰 버튼 모양 칸. 누르면 달력이 열려요 (PC: 칸 아래 팝업 / 모바일: 아래에서 올라오는 시트)
//   → 날짜를 고르면 onChange 로 적은 함수가 'YYYY-MM-DD' 값으로 불려요
// 값 읽기: uiDateValue('f-deadline') → 'YYYY-MM-DD' 또는 ''
//
// 키보드: 방향키 = 하루/한 주 이동, PageUp/PageDown = 한 달 이동, Enter = 선택, Esc = 닫기

// ================================================================
// 1) 날짜 도구
// ================================================================
function dpParse(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str || ''))) return null;
  var p = str.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function dpFormatValue(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 칸에 보여줄 글자: "Wed, November 11, 2026" (현재 언어)
function dpFormatLabel(str) {
  var d = dpParse(str);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(localeTag(), { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  } catch (e) {
    return str;
  }
}

// "November 2026"
function dpMonthLabel(year, month) {
  try {
    return new Intl.DateTimeFormat(localeTag(), { year: 'numeric', month: 'long' }).format(new Date(year, month, 1));
  } catch (e) {
    return year + '-' + String(month + 1).padStart(2, '0');
  }
}

// 요일 이름 7개 (일요일부터)
function dpWeekdays() {
  var names = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(2023, 0, 1 + i);   // 2023-01-01 은 일요일
    try { names.push(new Intl.DateTimeFormat(localeTag(), { weekday: 'short' }).format(d)); }
    catch (e) { names.push(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][i]); }
  }
  return names;
}


// ================================================================
// 2) 날짜 칸 (버튼)
// ================================================================
function uiDateField(opts) {
  var value = opts.value || '';
  var label = value ? dpFormatLabel(value) : t('date_select');
  return '<button type="button" class="input input-lg date-field' + (value ? '' : ' empty') + (opts.invalid ? ' invalid' : '') + '" ' +
    'id="' + escHtml(opts.id) + '" data-value="' + escHtml(value) + '" data-min="' + escHtml(opts.min || '') + '" ' +
    'data-onchange="' + escHtml(opts.onChange || '') + '" aria-haspopup="dialog" onclick="DatePicker.open(this)">' +
    '<span class="date-field-icon" aria-hidden="true">📅</span>' +
    '<span class="date-field-text">' + escHtml(label) + '</span>' +
    '</button>';
}

function uiDateValue(id) {
  var el = document.getElementById(id);
  return el ? (el.getAttribute('data-value') || '') : '';
}


// ================================================================
// 3) 달력 팝업
// ================================================================
var DatePicker = {
  field: null,      // 지금 연 날짜 칸 (버튼)
  el: null,         // 팝업
  backdrop: null,   // 모바일 시트 뒤 어두운 배경
  year: 0,
  month: 0,         // 0~11
  focusDate: null,  // 키보드로 고른 날짜 (Date)

  isSheet: function () {
    return window.matchMedia('(max-width: 639px)').matches;
  },

  open: function (field) {
    if (this.field === field) { this.close(); return; }
    this.close();
    this.field = field;
    var value = dpParse(field.getAttribute('data-value'));
    var min = dpParse(field.getAttribute('data-min'));
    var start = value || (min && min > new Date() ? min : new Date());
    this.year = start.getFullYear();
    this.month = start.getMonth();
    this.focusDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    var el = document.createElement('div');
    el.className = 'datepicker' + (this.isSheet() ? ' sheet' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', t('date_select'));
    el.addEventListener('keydown', this.onKey.bind(this));
    el.addEventListener('click', this.onClick.bind(this));
    this.el = el;

    if (this.isSheet()) {
      var bd = document.createElement('div');
      bd.className = 'datepicker-backdrop';
      bd.addEventListener('click', this.close.bind(this));
      document.body.appendChild(bd);
      this.backdrop = bd;
    }
    document.body.appendChild(el);
    field.setAttribute('aria-expanded', 'true');
    this.draw();
    this.position();
    this.focusDay();

    this._outside = this.onOutside.bind(this);
    this._reposition = this.position.bind(this);
    setTimeout(function () { document.addEventListener('mousedown', DatePicker._outside); }, 0);
    window.addEventListener('resize', this._reposition);
    window.addEventListener('scroll', this._reposition, true);
  },

  close: function (keepFocus) {
    if (!this.el) return;
    var field = this.field;
    this.el.remove();
    if (this.backdrop) this.backdrop.remove();
    this.el = null;
    this.backdrop = null;
    this.field = null;
    document.removeEventListener('mousedown', this._outside);
    window.removeEventListener('resize', this._reposition);
    window.removeEventListener('scroll', this._reposition, true);
    if (field) {
      field.setAttribute('aria-expanded', 'false');
      if (keepFocus !== false) { try { field.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    }
  },

  onOutside: function (e) {
    if (!this.el) return;
    if (this.el.contains(e.target) || (this.field && this.field.contains(e.target))) return;
    this.close(false);
  },

  // PC: 칸 바로 아래 (아래 공간이 모자라면 위). 모바일: 화면 아래 시트 (CSS)
  position: function () {
    if (!this.el || !this.field) return;
    if (this.el.classList.contains('sheet')) return;
    var r = this.field.getBoundingClientRect();
    var w = this.el.offsetWidth;
    var h = this.el.offsetHeight;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    var left = document.documentElement.dir === 'rtl' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    this.el.style.top = Math.max(8, top) + 'px';
    this.el.style.left = left + 'px';
  },

  minDate: function () {
    return this.field ? dpParse(this.field.getAttribute('data-min')) : null;
  },

  draw: function () {
    var min = this.minDate();
    var selected = this.field.getAttribute('data-value');
    var today = dpFormatValue(new Date());
    var first = new Date(this.year, this.month, 1);
    var daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    var lead = first.getDay();
    var prevDisabled = min && new Date(this.year, this.month, 0) < min;   // 지난달 마지막 날이 min 보다 이전
    var focusStr = this.focusDate ? dpFormatValue(this.focusDate) : '';

    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<span class="dp-empty" aria-hidden="true"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var date = new Date(this.year, this.month, d);
      var v = dpFormatValue(date);
      var disabled = min && date < min;
      var cls = 'dp-day' + (v === today ? ' today' : '') + (v === selected ? ' selected' : '') + (disabled ? ' disabled' : '');
      cells += '<button type="button" class="' + cls + '" data-date="' + v + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        (v === selected ? ' aria-pressed="true"' : '') +
        ' tabindex="' + (v === focusStr ? '0' : '-1') + '"' +
        ' aria-label="' + escHtml(dpFormatLabel(v)) + '">' + d + '</button>';
    }

    this.el.innerHTML =
      (this.el.classList.contains('sheet') ? '<div class="dp-grab" aria-hidden="true"></div>' : '') +
      '<div class="dp-head">' +
        '<button type="button" class="dp-nav" data-nav="-1"' + (prevDisabled ? ' disabled' : '') + ' aria-label="' + escHtml(t('date_prev_month')) + '"><span class="arrow" aria-hidden="true">◀</span></button>' +
        '<span class="dp-title" aria-live="polite">' + escHtml(dpMonthLabel(this.year, this.month)) + '</span>' +
        '<button type="button" class="dp-nav" data-nav="1" aria-label="' + escHtml(t('date_next_month')) + '"><span class="arrow" aria-hidden="true">▶</span></button>' +
      '</div>' +
      '<div class="dp-week" aria-hidden="true">' + dpWeekdays().map(function (w) { return '<span>' + escHtml(w) + '</span>'; }).join('') + '</div>' +
      '<div class="dp-grid">' + cells + '</div>' +
      '<div class="dp-foot">' +
        '<button type="button" class="btn btn-outline btn-sm" data-today>' + escHtml(t('date_today')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-close>' + escHtml(t('btn_close')) + '</button>' +
      '</div>';
  },

  focusDay: function () {
    if (!this.el) return;
    var btn = this.el.querySelector('.dp-day[tabindex="0"]:not([disabled])') ||
      this.el.querySelector('.dp-day.selected') || this.el.querySelector('.dp-day:not([disabled])');
    if (btn) btn.focus({ preventScroll: true });
  },

  moveMonth: function (n) {
    var min = this.minDate();
    var m = this.month + n;
    var y = this.year + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    if (min && new Date(y, m + 1, 0) < min) return;   // 전부 지난 달로는 못 가요
    this.year = y;
    this.month = m;
    // 포커스 날짜도 같은 날짜로 옮기기 (그 달에 없으면 마지막 날)
    var day = this.focusDate ? this.focusDate.getDate() : 1;
    var last = new Date(y, m + 1, 0).getDate();
    this.focusDate = new Date(y, m, Math.min(day, last));
    if (min && this.focusDate < min) this.focusDate = new Date(min.getTime());
    this.draw();
    this.position();
  },

  select: function (value) {
    var field = this.field;
    if (!field) return;
    var min = this.minDate();
    var d = dpParse(value);
    if (!d || (min && d < min)) return;
    field.setAttribute('data-value', value);
    field.classList.remove('empty', 'invalid');
    field.querySelector('.date-field-text').textContent = dpFormatLabel(value);
    var fnPath = field.getAttribute('data-onchange');
    this.close();
    if (fnPath) {
      // 'PageNew.setDeadline' 같은 글자를 실제 함수로 찾아서 불러요
      var parts = fnPath.split('.');
      var ctx = window;
      var fn = window;
      for (var i = 0; i < parts.length; i++) { ctx = fn; fn = fn ? fn[parts[i]] : null; }
      if (typeof fn === 'function') fn.call(ctx, value, field);
    }
  },

  onClick: function (e) {
    var day = e.target.closest('.dp-day');
    if (day && !day.disabled) { this.select(day.getAttribute('data-date')); return; }
    var nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) { this.moveMonth(+nav.getAttribute('data-nav')); return; }
    if (e.target.closest('[data-today]')) {
      var now = new Date();
      var min = this.minDate();
      if (min && now < min) {   // 오늘을 고를 수 없으면 그 달로만 이동
        this.year = min.getFullYear(); this.month = min.getMonth(); this.focusDate = min;
        this.draw(); this.focusDay();
      } else {
        this.select(dpFormatValue(now));
      }
      return;
    }
    if (e.target.closest('[data-close]')) this.close();
  },

  onKey: function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    var day = e.target.closest && e.target.closest('.dp-day');
    if (!day) return;
    var rtl = document.documentElement.dir === 'rtl';
    var step = 0;
    if (e.key === 'ArrowLeft') step = rtl ? 1 : -1;
    else if (e.key === 'ArrowRight') step = rtl ? -1 : 1;
    else if (e.key === 'ArrowUp') step = -7;
    else if (e.key === 'ArrowDown') step = 7;
    else if (e.key === 'PageUp') { e.preventDefault(); this.moveMonth(-1); this.focusDay(); return; }
    else if (e.key === 'PageDown') { e.preventDefault(); this.moveMonth(1); this.focusDay(); return; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!day.disabled) this.select(day.getAttribute('data-date')); return; }
    else return;

    e.preventDefault();
    var cur = dpParse(day.getAttribute('data-date'));
    var next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + step);
    var min = this.minDate();
    if (min && next < min) return;
    this.focusDate = next;
    if (next.getMonth() !== this.month || next.getFullYear() !== this.year) {
      this.year = next.getFullYear();
      this.month = next.getMonth();
    }
    this.draw();
    this.position();
    this.focusDay();
  }
};

// 언어가 바뀌면 열린 달력은 닫아요 (다시 열면 새 언어)
window.addEventListener('langchange', function () { DatePicker.close(false); });
