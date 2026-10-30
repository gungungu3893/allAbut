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

## 배경 (메타버스 월드)
- 이 앱은 나중에 **태국 전체를 맵으로 쓰는 메타버스**로 확장할 예정이다.
- 지금은 첫 지역인 **방콕의 한 골목(Soi allAbut)** 을 만든 상태다.
- 사용자는 거리를 걸어다니다가 **allAbut 빌딩**에 들어가면, 넓은 **체험관 내부**를 걸어다니며 데스크(01~05)를 차례로 방문해 주문한다.
- 지역을 계속 추가할 수 있도록 **데이터 기반**으로 설계한다.
  - 새 지역 = `world/zones/` 에 지도 데이터 파일 하나 추가 (오브젝트 목록: type, 위치, 회전, 충돌 박스)
  - 새 오브젝트 종류 = `world/builders.js` 에 `WORLD_BUILDERS.타입이름` 함수 추가
  - 새 건물 내부 = `world/interiors/` 에 파일 추가 후 `INTERIORS['id']` 로 등록

## 폴더 구조 (월드)
- `world/scene-manager.js` — 현재 장면 관리, 페이드 전환(0.6초), 이전 장면 dispose, 클릭/카메라 입력, 미니맵, 위치 저장
- `world/zones/bangkok-soi.js` — 첫 지역 지도 데이터
- `world/builders.js` — 데이터 type → 3D 오브젝트 (shophouse, allabut_building, tree, tuktuk, food_cart, bts_track, bts_station, power_pole, temple_roof, street_lamp, road, sidewalk, crosswalk, block)
- `world/zone.js` — 지도 데이터를 읽어 바깥 장면을 만드는 공통 코드
- `world/interiors/allabut-shop.js` — allAbut 체험관 내부 (데스크 01~05, CNC 부스, 전시대, 안내선)
- `world/player.js` — 내 캐릭터, 클릭 이동, A* 길찾기(셀 0.5m), 3인칭 따라가기 카메라

## 월드 공통 규칙
- 단위: 1 = 1미터, 로우폴리 + flatShading (아바타와 통일)
- 오브젝트 앞면은 +z, 바닥 y=0 기준으로 만들고 위치·회전은 데이터에서 적용
- 반복 오브젝트는 도형/재료 공유 (`ctx.geo`, `ctx.mat`)
- 모든 오브젝트 데이터에 충돌 박스(collider) 지정 → 통과 불가
- 안개로 먼 곳 흐리게, 그림자는 PC 만
- 모바일: 그림자 끄기, 픽셀 비율 최대 1.5, 행인 3명, 입자 줄이기, 안개 더 가깝게
- 위치 저장: `localStorage.allabut_location = { scene, x, z }`

## 스택
- Vanilla JS
- HTML / CSS
- Three.js (CDN, v0.160.0)
- Tailwind CSS (CDN)
- Supabase (CDN)

## 디자인
- 다크 테마 기반
- Navy: `#001D4A`
- Gold: `#D4AF37`
- Dark BG: `#06090f`

## 폰트
- IBM Plex Sans (200 / 600)
- IBM Plex Mono
- Google Fonts CDN 사용

## 다국어
- `t()` 함수로 번역 텍스트 사용
- 기본 언어: `en`
- 지원 언어: `en`, `ko`
