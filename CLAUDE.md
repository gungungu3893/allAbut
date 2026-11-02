# CLAUDE.md

## 브랜치
- 브랜치명: `main`

## Git Rules
- 작업 후 항상 아래 명령을 실행한다:
  ```bash
  git add . && git commit -m "메시지" && git push origin main
  ```

## 프로젝트
- **allAbut** — CNC 커스텀 어바트먼트 주문 플랫폼

## 컨셉: 2D 탑다운 픽셀아트 RPG (메타버스)
- 3D(Three.js)에서 **2D 탑다운 픽셀아트 RPG**로 전환했다 (포켓몬 / 스타듀밸리 느낌).
- 엔진: **Phaser 3** (CDN, jsdelivr `phaser@3.80.1` 고정 버전)
- 타일 크기 **32x32**, 픽셀아트 선명하게 (`pixelArt: true`, 안티앨리어싱 끔)
- 나중에 **태국 전체로 확장하는 메타버스**: 지역(zone) 데이터 기반 설계를 유지한다.
  - 새 지역 = `game/config/zones/` 에 지도 데이터 파일 추가 (`GAME_ZONES['id']`)
  - 새 건물 내부 = `game/config/interiors/` 에 데이터 파일 추가 (`GAME_INTERIORS['id']`)
  - 바깥/실내 씬 코드는 공통 (`ZoneScene`, `InteriorScene` → `WorldScene`)
- 그림 에셋은 나중에 **LimeZu Modern Interiors/Exteriors** 로 교체 예정.
  지금은 `BootScene` 에서 코드로 그린 임시 그래픽을 쓴다.
  모든 텍스처 키 이름은 `game/config/assets.js` 한 곳에 정의한다.

## 폴더 구조 (game/)
- `game/main.js` — Phaser 게임 생성 (Scale.RESIZE), 씬 등록, `openGame` / `closeGame`, 위치 저장, 줌 계산
- `game/config/assets.js` — 텍스처 키, 타일 종류(TILE_TYPES), 옷 색
- `game/config/zones/bangkok-soi.js` — 골목 지도 데이터 (바닥 칠하기 목록 + 오브젝트 목록)
- `game/config/interiors/allabut-shop.js` — 체험관 내부 지도 데이터 (벽·파티션, 데스크, 안내선)
- `game/scenes/BootScene.js` — 임시 그래픽을 코드로 생성 (타일셋, 오브젝트, 캐릭터 4방향 x 걷기 3프레임)
- `game/scenes/ZoneScene.js` — 바깥 지역 공통 씬 (뚝뚝, 행인)
- `game/scenes/InteriorScene.js` — 건물 내부 공통 씬 (데스크, NPC, 간판, 안내선, 다음 데스크 화살표)
- `game/scenes/UIScene.js` — 화면 고정 UI (위치 이름, 세션 타이머, 버튼, 미니맵, 대화창, 모바일 조이스틱)
- `game/systems/world.js` — 바깥/실내 공통 씬 클래스 (지도 → 타일/오브젝트/충돌, 입력, 상호작용, 카메라, 전환)
- `game/systems/player.js` — 플레이어 이동 (클릭 길찾기 + 방향키/WASD + 조이스틱)
- `game/systems/pathfinding.js` — 타일 기반 A* 길찾기
- `game/systems/npc.js` — NPC (데스크 직원 idle, 행인 patrol)
- `game/systems/nameplate.js` — 머리 위 이름표 (플레이어·다른 유저·NPC 공통): 칭호 / [길드 배지] 닉네임
- `game/systems/pet.js` — 어깨 펫 (방향 따라 위치·앞뒤 바뀜, 걸을 때 흔들림, 가끔 작은 동작)

## 게임 공통 규칙
- 좌표는 타일 단위 (x = 동쪽으로, y = 남쪽으로). 오브젝트가 차지한 칸은 지나갈 수 없다 (`solid: false` 예외)
- 상호작용: 오브젝트 데이터의 `interact: { kind, approach, label }` → 클릭하면 approach 칸까지 걸어가서 실행
- 깊이(depth)는 발 밑 y 좌표 → 나무·건물 뒤로 지나갈 수 있음
- 장면 전환: 검게 페이드아웃 → 씬 전환 → 페이드인 (0.5초)
- 위치 저장: `localStorage.allabut_location = { scene, x, y, facing }` (타일 단위)
- 지도 크기: 골목 28x40 타일, 체험관 22x28 타일
- 캐릭터: 한 프레임 32x64 (타일 2칸 높이), 4방향 x 걷기 3프레임. 펫은 16x16
- 줌: 모바일 가로 약 9~10타일, PC 가로 약 18타일 (세로 최소 10타일), 정수 배율에 가까우면 정수로
- 이름표 데이터: `profiles.nickname`, `profiles.title`, `profiles.guild_id` → `guilds(id, name, tag, color, emblem)`
  (`getProfile()` 이 `profile.guild` 로 함께 가져옴). 테스트: `DEBUG_SHOW_SAMPLE_GUILD = true` (nameplate.js 상단)
- 펫: `avatar-catalog.js` 의 `pet` 카테고리, 저장 위치 `profiles.avatar.pet`, 텍스처 키는 `assets.js` 의 `ASSETS.pets`

## 유지하는 것
- 랜딩 페이지, 로고, 로그인/회원가입, Supabase 연동, `session.js` (1시간 + 연장), `profiles` 테이블
- `avatar-catalog.js` 의 구조 (id, name, price, locked) — 내용은 2D용으로 바꿀 예정

## 스택
- Vanilla JS
- HTML / CSS
- Phaser 3 (CDN, v3.80.1)
- Tailwind CSS (CDN)
- Supabase (CDN)

## 디자인
- 다크 테마 기반
- Navy: `#001D4A`
- Gold: `#D4AF37`
- Dark BG: `#06090f`

## 폰트
- IBM Plex Sans (200 / 600)
- IBM Plex Mono (게임 UI 글자)
- Google Fonts CDN 사용

## 다국어
- `t()` 함수로 번역 텍스트 사용
- 기본 언어: `en`
- 지원 언어: `en`, `ko`
