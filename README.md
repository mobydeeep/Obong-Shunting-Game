# 오봉역 양회기지 입환게임

코레일 오봉역 양회기지 입환수송원을 위한 교육용 웹 게임입니다.

## 개발 중 실행

`index.html`을 브라우저로 바로 열면 됩니다 (별도 서버 불필요, 단 `assets/` 폴더가 같은 위치에 있어야 함).

```bash
# 로컬 서버로 열고 싶다면 (선택)
python3 -m http.server 8000
# 이후 http://localhost:8000 접속
```

## 배포용 단일 파일 만들기

사람들에게 나눠줄 땐 아래 명령으로 assets가 전부 인라인된 단일 HTML 파일을 생성합니다.

```bash
python3 build.py
```

`dist/오봉역_양회기지_입환게임.html` 하나만 다운로드/공유하면 브라우저에서 바로 실행됩니다.

## 프로젝트 구조

```
index.html              개발용 메인 파일
assets/bgm.mp3           배경음악
assets/start-character.png  시작화면 캐릭터 이미지
assets/icons/            바탕화면 아이콘 세트
build.py                 배포용 단일 파일 빌드 스크립트
CLAUDE.md                프로젝트 구조/규칙 (Claude Code용)
```

자세한 아키텍처 설명은 `CLAUDE.md`를 참고하세요.
