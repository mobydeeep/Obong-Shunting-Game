# 오봉역 양회기지 입환게임

한국 철도(코레일) 오봉역 양회기지 입환수송원을 위한 교육용 웹 게임. SVG 기반 야드 다이어그램에서 전환기 취급, 화차 연결/분리, 미션 수행을 학습한다.

## 파일 구조

```
index.html              개발용 메인 파일 (HTML+CSS+JS 단일 파일, assets는 상대경로 참조)
assets/
  bgm.mp3                배경음악 (사용자 작곡, "보이지 않는 곳에서")
  start-character.png    시작화면 캐릭터 이미지 (배경 제거된 PNG, 코레일 정비원 캐릭터)
  icons/                 앱 아이콘(.ico, .png 여러 사이즈) - 바탕화면 바로가기용
build.py                 배포용 단일 파일 빌드 스크립트 (assets를 base64로 인라인해서 dist/*.html 생성)
dist/                    빌드 결과물 (git에는 커밋하지 않음, 매번 build.py로 재생성)
```

**중요**: 개발은 `index.html`에서 하되, 오디오/이미지는 반드시 `assets/` 상대경로로 참조한다 (base64로 인라인하지 않는다 — 파일이 거대해지고 편집이 어려워짐). 배포할 땐 `python3 build.py`로 단일 파일을 생성해서 그것만 공유한다.

## 기술 스택

순수 HTML/CSS/JS, 프레임워크 없음. SVG로 야드를 직접 그림 (`viewBox="0 -140 1550 900"`). 외부 라이브러리 없음 — Web Audio API로 효과음 합성 (`SoundFX` 객체).

## 야드 토폴로지

- 작업선(work track) 11개: 양회기지 작업 화차용
- 전환기 번호: 301~310 (양회기지 내부), 42/31/33/45/64/62/61/60A/60B (본선 연결 사다리 구간)
- 리프(leaf) 목적지: 인상선, 터널선, 그 외 명명된 착발선들(예: 쌍용, 쌍용유치, 한일, 삼표, 성신, 냉연, 아세아, 아세아유치, 양회1번, 양회2번, 고상홈, 열연 등)
- `nodeXY(id)` — 전환기/노드 좌표 조회 함수
- `LADDER_ROUTE_PRESETS` — 본선(본11~본17 등)을 클릭하면 자동으로 필요한 전환기를 전부 맞춰주는 원클릭 진로 설정 데이터
- 308-309 구간은 곡선 엣지 (`parsePoints(seg.line).slice().reverse()`로 처리)
- SVG viewBox 상단 y:-140~0 구간은 오버레이 패널(화차선택 등)이 트랙을 가리지 않도록 비워둔 여백 — 이 구간을 넘어서면 선로를 가리게 되니 패널 높이 계산 시 항상 이 여백을 존중할 것

## 색상 (코레일 공식 브랜드)

- KORAIL BLUE: `#005BAC` (Pantone 293C)
- KORAIL Light Blue: `#00B2E3` (Pantone 306C)
- 주요 버튼 그라데이션: `#003D7A → #005BAC`

## UI 패널 시스템 (중요한 아키텍처 패턴)

모든 오버레이 패널(`.overlay-panel`)은 `.map-wrap`(position:relative) 안에서 `position:absolute`로 배치된다. 각 패널은 `makePanelDraggable(panel, handle, onTapCallback)`로 드래그 가능하며, 사용자가 직접 옮기면 `panel.dataset.userMoved = '1'`이 설정되어 이후 자동 배치 로직이 그 패널을 건드리지 않는다.

자동 배치 함수들 (겹침 방지용, 반드시 `resize`에 연결하고 `requestAnimationFrame`으로 초기 실행):
- `layoutBottomRightPanels()` — HUD 패널 + 조작버튼 패드 (하단 우측, `bottom:8px` 고정 — `top:%` 방식은 패널이 지도 높이에 따라 잘리는 버그가 있었으므로 사용 금지)
- `layoutTopRightPanels()` — 개통 진로 패널 옆에 조작키 안내 패널을 겹치지 않게 배치 (개통 진로 패널의 실제 렌더링 너비를 측정해서 그 오른쪽에 배치)
- `layoutTopLeftPanels()` — 미션 패널 오른쪽에 화차선택 패널을 배치, 화차선택 패널의 스크롤 영역(`.cs-scroll-area`) 최대높이를 지도 상단 여백(y:-140~0)에 맞춰 동적 계산

화차선택 패널 구조: `.ov-body` 안에 `.cs-scroll-area`(화차 목록, 스크롤됨)와 `.cs-action-row`(연결/분리 버튼, 항상 고정 표시)가 분리되어 있다 — 화차가 많이 연결되어 목록이 길어져도 버튼이 잘리지 않도록 하기 위함. 이 구조를 건드릴 땐 반드시 유지할 것.

## 게임 시스템

- **효과음**: `SoundFX.couple()`, `.horn()`, `.crash()`, `.success()` — Web Audio API 합성음
- **주의기적**: `Shift` 키 → `triggerWarningHorn()` → 기관차 지붕 위에 스피커+음파 SVG 아이콘(`hornFxG`, class `horn-fx.show`)이 잠깐 표시됨
- **이례사항 NPC**: 양회수송원(301~310호 배회, 무작위 전환기 취급), 본선직원(본선 배회, 이동 중인 차량과 접촉 시 사상사고 — `isNearMovingVehicle()`이 정차 중인 화차는 제외하고 판정)
- **레벨 시스템**: `getLevelInfo(record)` — 레벨 = 1 + floor((해결한 입환수 − (탈선+후부돌파+사상사고)) / 10). 구간별 색상: Lv1-5 흰색, 6-10 초록(#4ade80), 11-15 보라(#a78bfa), 16-20 파랑(#60a5fa), 21-25 갈색(#b5651d), 26-30 밝은주황(#ff9f1c), 31-35 밝은분홍(#ff6fb0), 36+ 연노랑(#fff59d). 랭킹 이름 앞에 표시, "이름" 헤더 클릭 시 레벨 기준 정렬.
- **랭킹 저장**: `loadRankRecords()`/`saveRankRecords()` — localStorage 기반. Admin의 "📋 기록" 탭에서 직접 값 수정/삭제 가능 (`renderAdminRecordsList()` 등).
- **Admin 패널**: 비밀번호 4231. 탭: 화차·선로·미션·설정·이례사항·기록.
- **본선 진로**: 전환기를 하나씩 조작하지 않고, 본선 라벨(예: 본17)을 마우스로 클릭하면 `selectQuickRoute(name)`이 필요한 전환기를 전부 맞추고 진로를 초록색으로 표시.

## 조작키

`←→` 가속(관성) · `Space` 제동 · `Tab` 전환기 선택 · `Enter` 전환기 전환 · `Ctrl` 화차 연결/분리 · `Shift` 주의기적 · 대부분의 조작은 마우스 클릭으로도 가능.

## 작업 시 주의사항

- 이 파일은 수천 줄짜리 단일 HTML이라 str_replace 시 old_str이 유일한지 항상 확인할 것 (과거 세션에서 중복 매치로 인해 실수로 코드 블록이 삭제된 적 있음)
- 수정 후에는 반드시 `<script>` 내용을 추출해서 `node --check`로 문법 검증할 것
- div/svg 태그 open/close 개수가 일치하는지 확인할 것
- 브라우저별 렌더링 차이(예: 구형 Edge에서 SVG 선이 각지게 보이는 문제)는 `shape-rendering:geometricPrecision` 같은 렌더링 힌트로 완화 가능하나, 실제 브라우저 테스트 없이는 확신할 수 없음 — 가능하면 Playwright 등으로 스크린샷을 찍어 직접 확인할 것
