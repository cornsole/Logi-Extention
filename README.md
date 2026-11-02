# YouTube Horizontal Wheel Seek

Logitech MX Master 같은 가로 휠 마우스로 YouTube 재생 위치를 이동하는 Chrome·Firefox 확장 프로그램입니다.

## 주요 기능

- 일반 영상, Shorts, `youtube.com/embed`, `youtube-nocookie.com/embed` 지원
- 가로 휠 이동량에 비례해 재생 위치 이동
- 기본 감도 `5초 / 100px`, 팝업에서 `1–20초 / 100px`로 조절
- 휠 방향 반전 설정
- 재생 중이면 계속 재생하고, 일시정지 중이면 정지 상태 유지
- 볼륨 슬라이더의 기존 가로 휠 동작 유지
- VOD, 광고, DVR 라이브의 실제 탐색 가능 범위 적용

## 빠른 설치

Node.js 18 이상이 필요합니다. 외부 npm 패키지는 설치하지 않습니다.

```bash
git clone https://github.com/cornsole/Logi-Extention.git
cd Logi-Extention
npm run package
```

명령을 실행하면 다음 디렉터리가 생성됩니다.

- Chrome: `dist/chrome`
- Firefox: `dist/firefox`

### Chrome

1. 주소창에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. 이 프로젝트의 `dist/chrome` 디렉터리를 선택합니다.
5. 이미 열려 있던 YouTube 탭을 새로고침합니다.

### Firefox 140 이상

1. 주소창에서 `about:debugging#/runtime/this-firefox`를 엽니다.
2. **임시 부가 기능 로드**를 선택합니다.
3. `dist/firefox/manifest.json`을 선택합니다.
4. 이미 열려 있던 YouTube 탭을 새로고침합니다.

임시 부가 기능은 Firefox를 종료하면 제거됩니다. 영구 설치에는 Mozilla 서명이 필요합니다.

## 사용법

1. YouTube 영상을 엽니다.
2. 마우스 포인터를 플레이어 위에 둡니다.
3. MX Master의 가로 휠을 오른쪽으로 돌리면 앞으로, 왼쪽으로 돌리면 뒤로 이동합니다.
4. 브라우저 툴바의 확장 아이콘을 눌러 감도와 방향을 변경합니다.

| 설정 | 기본값 | 설명 |
|---|---:|---|
| 탐색 감도 | 5초 / 100px | 같은 휠 이동으로 변경할 재생 시간을 조절합니다. |
| 가로 휠 방향 반전 | 꺼짐 | 오른쪽·왼쪽 탐색 방향을 서로 바꿉니다. |

설정은 브라우저의 동기화 저장소에 보관되며 열린 YouTube 탭에도 즉시 반영됩니다.

## 입력 충돌 방지

- 볼륨 슬라이더 위에서는 확장이 가로 휠 이벤트를 처리하지 않습니다.
- 일반 세로 휠은 변경하지 않습니다.
- 플레이어 밖의 가로 휠은 변경하지 않습니다.
- 수직 이동량이 더 큰 대각선 입력은 세로 스크롤로 간주합니다.
- 탐색할 수 없는 라이브 스트림에서는 입력을 무시합니다.

## 문제 해결

### 가로 휠을 돌려도 반응하지 않음

1. Logitech Options+에서 해당 브라우저의 엄지 휠이 **가로 스크롤**로 설정되어 있는지 확인합니다.
2. Chrome 또는 Firefox 확장 관리 화면에서 확장이 활성화되어 있는지 확인합니다.
3. 확장을 처음 설치하거나 다시 로드했다면 YouTube 탭을 새로고침합니다.
4. 포인터가 YouTube 플레이어 안에 있는지 확인합니다.
5. 라이브 영상이라면 브라우저가 되감기를 허용하는 DVR 스트림인지 확인합니다.

### 방향이나 이동량이 맞지 않음

브라우저 툴바에서 확장 아이콘을 누른 뒤 **탐색 감도**와 **가로 휠 방향 반전**을 조절합니다. 운영체제와 Logitech Options+ 설정에 따라 장치가 보내는 휠 이동량이 달라질 수 있습니다.

## 권한과 개인정보

| 권한 | 용도 |
|---|---|
| `storage` | 감도와 방향 설정을 브라우저 동기화 저장소에 보관합니다. |
| `youtube.com`, `youtube-nocookie.com` | YouTube 플레이어에서 가로 휠 이벤트를 처리합니다. |

확장은 사용 기록이나 개인정보를 수집·전송하지 않습니다.

## 개발과 검사

```bash
npm test
npm run package
```

- `npm test`: 휠 단위 변환, 감도, 방향, 탐색 범위 테스트
- `npm run package`: Chrome·Firefox용 배포 디렉터리 생성

## 프로젝트 구조

- `src/content/wheel-normalizer.js`: `WheelEvent` 단위 정규화와 탐색 범위 계산
- `src/content/settings.js`: 동기화 설정 저장소
- `src/content/youtube-wheel.js`: YouTube 플레이어 이벤트 처리
- `src/popup`: 감도와 방향 설정 UI
- `scripts/package.mjs`: 브라우저별 배포 디렉터리 생성
