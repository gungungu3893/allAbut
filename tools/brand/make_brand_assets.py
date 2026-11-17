#!/usr/bin/env python3
# ================================================================
# allAbut — 파비콘 · 공유 이미지 만들기 (사이트에는 안 올라가요 — build.sh 가 tools/ 를 복사하지 않아요)
# ================================================================
# 하는 일
#   1) IBM Plex Sans / Mono 글꼴 파일을 Google Fonts 에서 받아 (처음 한 번, tools/brand/.fonts/ — git 에는 안 올려요)
#   2) 로고 "allAbut 5μm" 글자를 **선(path)** 으로 바꿔 SVG 를 만들어요 → 보는 사람 컴퓨터에 글꼴이 없어도 똑같이 보여요
#      - 네이비(#001D4A) 정사각형 + 모서리 살짝 둥글게, 가운데 전체 워드마크
#      - all / but = 흰색, A = 골드 굵게 크게, 5μm = 골드 위첨자 (사이트 로고 css/landing.css 와 같은 비율)
#      - 워드마크 폭 = 정사각형의 88% (좌우 여백 6%), 세로 가운데
#      - 작은 크기는 획을 굵게: 16px = all/but 600 · 32px = 500 · 48px = 400 (A 는 700), 5μm 은 48px 부터 / 96px = 300 · 600 / 180px 이상 = 사이트와 같은 200 · 600
#   3) node tools/brand/render.js 로 PNG · ICO · 공유 이미지(og-image.png) · 미리보기(docs/favicon-preview.png) 를 만들어요
#
# 실행 (저장소 맨 위 폴더에서):
#   pip install fonttools
#   python3 tools/brand/make_brand_assets.py
# 결과: assets/brand/favicon.svg · favicon.ico · favicon-48/96/192/512.png · apple-touch-icon.png · og-image.png,
#       favicon.ico (사이트 맨 위 /favicon.ico), docs/favicon-preview.png
#       (assets/brand/line-icon.png — LINE 카드용 A 아이콘 — 은 건드리지 않아요)
import json
import os
import re
import subprocess
import sys
import urllib.request

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FONT_DIR = os.path.join(HERE, '.fonts')
TMP = os.path.join(HERE, '.build')
BRAND = os.path.join(ROOT, 'assets', 'brand')

NAVY = '#001D4A'
GOLD = '#D4AF37'
WHITE = '#FFFFFF'

# 사이트 로고 비율 (css/landing.css .logo — 모두 .logo 글자 크기 1em 기준)
A_SIZE = 1.3333          # .logo-a font-size
UM_SIZE = 0.3056         # .logo-um font-size
UM_RAISE = 1.7273 * UM_SIZE   # .logo-um top: -1.7273em (자기 글자 크기 기준) → 로고 글자 크기 기준으로 바꿈
UM_GAP = 1 / 36          # .logo-um margin-left 1px (로고 36px 기준)
MARGIN = 0.06            # 좌우 여백 6%
RADIUS = 0.14            # 모서리 둥글기 (한 변의 14%)

FONTS_CSS = ('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@200;300;400;500;600;700'
             '&family=IBM+Plex+Mono:wght@400;500;600')


def ensure_fonts():
    os.makedirs(FONT_DIR, exist_ok=True)
    need = ['IBMPlexSans-200.ttf', 'IBMPlexSans-300.ttf', 'IBMPlexSans-400.ttf', 'IBMPlexSans-600.ttf',
            'IBMPlexSans-500.ttf', 'IBMPlexSans-700.ttf', 'IBMPlexMono-400.ttf', 'IBMPlexMono-500.ttf']
    if all(os.path.exists(os.path.join(FONT_DIR, n)) for n in need):
        return
    # 글꼴 주소는 CSS 에서 읽어요 (User-Agent 없이 받으면 .ttf 주소를 줘요)
    css = urllib.request.urlopen(FONTS_CSS).read().decode('utf8')
    for fam, w, url in re.findall(r"font-family: '([^']+)';\s*font-style: normal;\s*font-weight: (\d+);.*?url\(([^)]+)\)", css, re.S):
        name = fam.replace(' ', '') + '-' + w + '.ttf'
        urllib.request.urlretrieve(url, os.path.join(FONT_DIR, name))


_fonts = {}


def font(name):
    if name not in _fonts:
        _fonts[name] = TTFont(os.path.join(FONT_DIR, name + '.ttf'))
    return _fonts[name]


def run_paths(text, fname, size, x, y_raise):
    """글자 한 줄을 path 로. size = 로고 글자 크기 1em 대비 배수, x = 시작 위치(em). 돌려주는 값: (path 목록, 끝 x, bbox)"""
    f = font(fname)
    upm = f['head'].unitsPerEm
    cmap = f.getBestCmap()
    gs = f.getGlyphSet()
    scale = size / upm
    paths = []
    bbox = None
    for ch in text:
        code = ord(ch)
        if code == 0x3BC and code not in cmap:   # μ (그리스 문자) 가 없는 글꼴이면 µ (마이크로 기호)
            code = 0xB5
        gname = cmap[code]
        # SVG 는 y 가 아래로 커져서 위아래를 뒤집어요 (기준선 = 0)
        t = (scale, 0, 0, -scale, x, -y_raise)
        sp = SVGPathPen(gs)
        gs[gname].draw(TransformPen(sp, t))
        d = sp.getCommands()
        if d:
            paths.append(d)
        bp = BoundsPen(gs)
        gs[gname].draw(TransformPen(bp, t))
        if bp.bounds:
            b = bp.bounds
            bbox = b if bbox is None else (min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3]))
        x += f['hmtx'][gname][0] * scale
    return paths, x, bbox


def wordmark(w_ab, w_a, with_um):
    """로고 글자들 → [(색, path)], bbox (단위: 로고 글자 크기 1em)"""
    parts = []
    box = None

    def add(color, text, fname, size, x, raise_=0.0):
        nonlocal box
        ps, nx, b = run_paths(text, fname, size, x, raise_)
        for p in ps:
            parts.append((color, p))
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        return nx

    x = 0.0
    x = add(WHITE, 'all', 'IBMPlexSans-%d' % w_ab, 1.0, x)
    x = add(GOLD, 'A', 'IBMPlexSans-%d' % w_a, A_SIZE, x)
    x = add(WHITE, 'but', 'IBMPlexSans-%d' % w_ab, 1.0, x)
    if with_um:
        add(GOLD, '5μm', 'IBMPlexMono-%d' % (500 if w_ab >= 400 else 400), UM_SIZE, x + UM_GAP, UM_RAISE)
    return parts, box


def icon_svg(size_px, w_ab, w_a, with_um, rounded=True, view=512):
    """정사각형 아이콘 SVG (viewBox 0 0 view view). size_px 는 주석용"""
    parts, (x0, y0, x1, y1) = wordmark(w_ab, w_a, with_um)
    k = view * (1 - 2 * MARGIN) / (x1 - x0)          # 워드마크 폭 = 88%
    tx = view * MARGIN - x0 * k
    ty = view / 2 - (y0 + y1) / 2 * k                   # 잉크 기준 세로 가운데
    rx = round(view * RADIUS, 2) if rounded else 0
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (view, view, view, view),
           '<title>allAbut 5μm</title>',
           '<rect width="%d" height="%d" rx="%s" fill="%s"/>' % (view, view, rx, NAVY),
           '<g transform="translate(%.3f %.3f) scale(%.5f)">' % (tx, ty, k)]
    for color, d in parts:
        out.append('<path fill="%s" d="%s"/>' % (color, d))
    out.append('</g></svg>')
    return '\n'.join(out) + '\n'


def wordmark_svg(w_ab=200, w_a=600, height=200):
    """배경 없는 워드마크 (공유 이미지용) — 글자 높이 기준"""
    parts, (x0, y0, x1, y1) = wordmark(w_ab, w_a, True)
    k = height / (y1 - y0)
    W = (x1 - x0) * k
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.2f %.2f" width="%.2f" height="%.2f">' % (W, height, W, height),
           '<g transform="translate(%.3f %.3f) scale(%.5f)">' % (-x0 * k, -y0 * k, k)]
    for color, d in parts:
        out.append('<path fill="%s" d="%s"/>' % (color, d))
    out.append('</g></svg>')
    return '\n'.join(out) + '\n'


def main():
    ensure_fonts()
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(BRAND, exist_ok=True)
    # 크기별 모양 (작을수록 획 굵게, 5μm 은 48px 부터)
    variants = {
        16: (600, 700, False),   # 16px 은 글자가 2~3픽셀 높이라 가장 굵게
        32: (500, 700, False),
        48: (400, 700, True),
        96: (300, 600, True),
        180: (200, 600, True),
        192: (200, 600, True),
        512: (200, 600, True),
    }
    jobs = []
    for px, (w_ab, w_a, um) in variants.items():
        p = os.path.join(TMP, 'icon-%d.svg' % px)
        open(p, 'w').write(icon_svg(px, w_ab, w_a, um, rounded=(px != 180)))   # 180 = apple-touch-icon: 모서리 없이 꽉 (iOS 가 둥글게 잘라요, 투명 배경 금지)
        jobs.append({'px': px, 'svg': p})
    # 브라우저 탭 · 검색 결과용 SVG: 탭에서는 작게(16~32px) 보이니까 굵은 버전 + 5μm
    open(os.path.join(BRAND, 'favicon.svg'), 'w').write(icon_svg(0, 400, 700, True))
    open(os.path.join(TMP, 'wordmark.svg'), 'w').write(wordmark_svg())
    json.dump({'jobs': jobs, 'brand': BRAND, 'root': ROOT, 'tmp': TMP, 'fonts': FONT_DIR},
              open(os.path.join(TMP, 'jobs.json'), 'w'))
    subprocess.check_call(['node', os.path.join(HERE, 'render.js'), os.path.join(TMP, 'jobs.json')])


if __name__ == '__main__':
    sys.exit(main())
