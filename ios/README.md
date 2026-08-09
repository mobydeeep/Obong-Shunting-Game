# 아이폰 앱

안드로이드처럼 "파일 하나 받아서 설치"가 **아이폰에서는 안 된다.**
애플이 서명되지 않은 앱의 설치를 막고 있어서, 아래 세 가지 중 하나를 골라야 한다.

| 방법 | 비용 | 나눠주기 | 비고 |
|---|---|---|---|
| **홈 화면에 추가 (권장)** | 없음 | 링크만 보내면 끝 | Safari로 열고 공유 → "홈 화면에 추가". 주소창 없는 전체화면으로 뜬다. 설치 과정이 없고 게임을 고치면 바로 반영된다 |
| AltStore / Sideloadly | 없음 | 각자 PC로 직접 서명 | 여기서 만든 `.ipa`를 본인 Apple ID로 서명해 설치. **7일마다 다시 서명**해야 한다 |
| Apple Developer Program | $99/년 | TestFlight 링크 | 최대 100명까지 초대 가능. 정식 배포에 가장 가깝다 |

대부분의 경우 **홈 화면에 추가**로 충분하다. 이미 필요한 설정(`apple-mobile-web-app-capable`,
아이콘, 매니페스트)이 다 들어 있어서 안드로이드 앱과 거의 같은 화면이 나온다.

## .ipa 만들기

GitHub → Actions → **Build iOS IPA** → Run workflow → 끝나면 `ios-ipa-unsigned` 아티팩트를 받는다.
서명이 안 된 파일이므로 위 표의 2번·3번 방법으로 서명해야 설치된다.

## 구조

안드로이드 TWA와 같은 방식이다 — 앱은 껍데기일 뿐이고 내용은 GitHub Pages에 올라간 것을 그대로 띄운다.
따라서 **게임을 고치면 앱을 다시 배포하지 않아도 반영된다.**

```
ios/
  project.yml                     XcodeGen 설정 (.xcodeproj는 CI에서 생성)
  ObongShunting/
    AppDelegate.swift             가로모드 고정
    GameViewController.swift      전체화면 WKWebView + 오프라인 안내
    Info.plist / LaunchScreen.storyboard
    Assets.xcassets/              앱 아이콘(1024)
```

로컬에서 열어보려면 `brew install xcodegen && cd ios && xcodegen generate` 후
`ObongShunting.xcodeproj`를 Xcode로 연다.
