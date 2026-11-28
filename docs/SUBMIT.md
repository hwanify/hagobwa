# 앱스토어 제출 순서 (App Store Connect)

폰 브라우저로도 할 수 있어요: https://appstoreconnect.apple.com → 나의 앱 → 하고봐

## 1. 앱 정보 (왼쪽 메뉴 "앱 정보")
- 부제: `운동하고 보는 스크린타임`
- 카테고리: 기본 **건강 및 피트니스**, 보조 **생산성**
- 콘텐츠 권한: 서드파티 콘텐츠 없음
- 연령 등급 → 편집 → 모든 질문 "아니요" → 4+

## 2. 앱 개인정보 보호 (왼쪽 메뉴)
- 개인정보처리방침 URL: `https://hwanify.github.io/hagobwa/privacy/`
- 데이터 수집 → **"아니요, 이 앱에서 데이터를 수집하지 않습니다"** → 게시

## 3. 가격 및 사용 가능 여부
- 가격: **무료 (0원)**
- 국가: **대한민국만** 선택 (EU 판매자 정보 요건 피하기)

## 4. 버전 페이지 (iOS 앱 → 1.0 제출 준비 중)
- 스크린샷 (6.9인치 디스플레이): `docs/store-screenshots/store-1.png` ~ `store-5.png` 순서대로
- 프로모션 텍스트 / 설명 / 키워드: `docs/APP_STORE.md`에서 복사
- 지원 URL: `https://hwanify.github.io/hagobwa/`
- 저작권: `2026 (본인 이름)`
- **빌드**: "빌드 추가" → TestFlight에 있는 **가장 최신 빌드** 선택 (제출 직전에 새로 만든 빌드: 앱을 처음 켤 때 최신 화면이 바로 나와요)
  - 수출 규정(암호화) 질문이 나오면 "아니요" (앱 설정에 이미 표시돼 있어서 안 나올 수도 있어요)

## 5. 앱 심사 정보 (버전 페이지 아래쪽)
- 로그인 필요: **체크 해제**
- 연락처: 이름, 전화번호, 이메일 (애플만 봐요)
- 메모: `docs/APP_STORE.md`의 "심사 메모" 영어 문단 그대로 붙여넣기

## 6. 제출
- 오른쪽 위 **"심사에 추가"** → **"심사 제출"**
- 보통 1~3일 안에 결과가 와요. 거절되면 사유를 그대로 보내 주세요.

## 자주 나오는 거절 사유와 대응
| 사유 | 대응 |
|---|---|
| 4.2 최소 기능 | 심사 메모에 스크린타임 잠금 + 카메라 운동 인식이 핵심 기능임을 설명 (이미 들어 있음) |
| 2.1 앱 완성도 (크래시/동작 안 함) | 어떤 화면에서 그런지 알려 주면 수정 |
| 5.1.1 개인정보 | 개인정보처리방침 URL이 열리는지 확인 |
| Family Controls 관련 | 본인 사용(individual) 목적이라고 답변 (심사 메모에 있음) |

## 다음 네이티브 변경(새 빌드) 때 같이 할 일

지금 고치면 네이티브 지문(런타임 버전)이 바뀌어서 빌드 18 사용자에게 OTA가 끊겨요. 결제(RevenueCat)처럼 어차피 새 빌드가 필요한 변경이 생길 때 같이 넣어요.

### 확장 프로그램 빌드 번호(CFBundleVersion) 맞추기
- 증상: 빌드를 올리면 App Store Connect가 경고를 보내요. `The CFBundleVersion of an app extension ('1') must match that of its containing parent app ('18')`. 경고일 뿐이라 심사와 배포는 돼요.
- 원인: 스크린타임 확장 3개(`targets/ActivityMonitorExtension`, `ShieldAction`, `ShieldConfiguration`)는 `@kingstinct/expo-apple-targets`가 만들어요. 이 플러그인은 확장의 `CURRENT_PROJECT_VERSION`을 prebuild 시점의 `ios.buildNumber`로 정하는데, 값이 없으면 `1`을 써요. 빌드 번호는 EAS 원격 버전(`appVersionSource: remote`, `autoIncrement`)이라 prebuild 뒤에 본 앱에만 들어가요.
- 고치는 방법(추천):
  1. `ios-release.yml`의 빌드 잡에서 `eas build --local` 전에 다음 번호를 구해요. `npx eas-cli build:version:get --platform ios --profile production --json`로 지금 번호를 받아 +1 하고, 환경 변수(예: `HAGOBWA_BUILD_NUMBER`)로 넘겨요.
  2. `app.json`을 `app.config.js`로 감싸서 그 변수가 있을 때만 `ios.buildNumber`에 넣어요. 그러면 확장 3개도 같은 번호를 받아요.
  3. 먼저 확인할 것: 이 값 때문에 지문이 빌드마다 바뀌면 안 돼요. `npx eas-cli fingerprint:generate --platform ios --build-profile production --json`을 번호만 바꿔 두 번 돌려 해시가 같은지 봐요. 다르면 `@expo/fingerprint`의 `sourceSkips`에 `ExpoConfigVersions`를 넣어요(`fingerprint.config.js`).
- 확인: 새 빌드 업로드 뒤 경고 메일이 안 오면 끝. 또는 `.ipa`를 풀어 `PlugIns/*.appex/Info.plist`의 `CFBundleVersion`이 앱 번호와 같은지 봐요.
- 주의: `app.json`의 `version`(1.0.0)은 이 작업에서 바꾸지 않아요. 바꾸면 지문이 바뀌어요.
