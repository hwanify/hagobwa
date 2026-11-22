# iOS TestFlight 배포 (폰만으로 설정 가능)

빌드는 Expo 클라우드(EAS)에서, 실행은 GitHub Actions 버튼으로 해요.
Mac, Xcode, 컴퓨터 설치 없이 폰 브라우저로 전부 할 수 있어요.

## 미리 필요한 것

- **Apple Developer Program** 가입 (연 $99 / 약 13만 원). 개인으로 가입하면 됩니다.
- **Expo 계정** (무료, https://expo.dev). 무료 플랜도 매달 iOS 빌드를 일정 횟수 할 수 있어요.

## 1단계. 키 3개 만들기

1. **Expo 토큰**
   expo.dev → 프로필 → Access tokens → Create token → 값 복사
2. **App Store Connect API 키** (애플 로그인·2단계 인증 없이 빌드하려고 쓰는 키)
   appstoreconnect.apple.com → 사용자 및 액세스 → 통합(Integrations) → App Store Connect API → 팀 키 → `+`
   - 이름 아무거나, 권한 **App Manager** (또는 Admin)
   - 만들고 나면 **Key ID**, 위쪽의 **Issuer ID** 복사, **API 키 다운로드(.p8)** 는 한 번만 받을 수 있어요
3. **Team ID**
   developer.apple.com → Account → Membership details → Team ID (10자리)

## 2단계. GitHub에 넣기

github.com/hwanify/hagobwa → Settings → Secrets and variables → Actions

**Secrets** (New repository secret)

| 이름 | 값 |
|---|---|
| `EXPO_TOKEN` | Expo 토큰 |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | .p8 파일 내용 전체 (`-----BEGIN PRIVATE KEY-----` 부터 끝까지) |
| `APPLE_TEAM_ID` | Team ID |

**Variables** 탭

| 이름 | 값 |
|---|---|
| `APPLE_TEAM_TYPE` | 개인 가입이면 `INDIVIDUAL`, 회사면 `COMPANY_OR_ORGANIZATION` (안 넣으면 INDIVIDUAL) |

## 3단계. 1회 설정 실행

GitHub → Actions → **iOS 1회 설정 (EAS)** → Run workflow

- Expo 프로젝트를 만들고 `mobile/app.json` 에 프로젝트 ID를 커밋해요.
- 번들 ID `com.hagobwa.app` 등록, 배포 인증서와 프로비저닝 프로필을 만들어요.
- 실패하면 로그를 Claude에게 보여주세요.

## 4단계. App Store Connect에 앱 만들기

appstoreconnect.apple.com → 앱 → `+` → 신규 앱

- 플랫폼 iOS, 이름 `하고봐` (이미 있으면 다른 이름), 기본 언어 한국어
- 번들 ID: `com.hagobwa.app` (3단계 후 목록에 나와요), SKU 아무거나 (예: `hagobwa`)
- 만든 뒤 **앱 정보 → Apple ID** (숫자 10자리)를 복사해서
  GitHub Variables 에 `ASC_APP_ID` 로 추가

## 5단계. 배포 (자동)

`main` 에 앱 코드가 올라가면 **iOS 배포 (자동 빌드/OTA)** 워크플로가 알아서 돌아요.

| 바뀐 것 | 하는 일 | 폰에서 |
|---|---|---|
| 화면, 문구, 로직 등 JS 코드만 | **OTA 업데이트** (1~2분, 빌드·심사 없음) | 앱을 껐다 켜면 바로 적용 |
| 새 라이브러리, 권한, app.json 네이티브 설정 | **새 빌드 + TestFlight 업로드** (10분 + 애플 처리) | TestFlight 앱에서 업데이트 |

- 판단 기준: 앱의 네이티브 지문(fingerprint)이 이미 빌드된 버전과 같으면 OTA, 다르면 빌드.
- 손으로 돌릴 때: Actions → **iOS 배포 (자동 빌드/OTA)** → Run workflow → `auto` / `build` / `update` 선택.
- 결과는 실행 화면의 Summary 에 "OTA 업데이트 배포 완료" 또는 "새 빌드를 TestFlight에 올렸어요" 로 나와요.

## 참고

- 지금 버전은 실제로 다른 앱을 잠그지 않아요 (Screen Time 권한은 애플 별도 승인 필요, `NATIVE_BLOCKING.md`).
  TestFlight 에서는 온보딩, 운동, 충전, 차단 화면 흐름과 음성 구령, 진동을 확인할 수 있어요.
- 폰 카메라 자동 세기도 아직 탭 세기로 대신해요.
