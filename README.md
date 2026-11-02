# YouTube Horizontal Wheel Seek

Logitech MX Master 같은 가로 휠 마우스로 YouTube 재생 위치를 이동하는 Chrome·Firefox 확장 프로그램입니다.

## 동작

- 일반 영상, Shorts, `youtube.com/embed`, `youtube-nocookie.com/embed` 지원
- 플레이어 위의 가로 휠 입력을 재생 시간으로 변환
- 기본 감도: 100px당 5초, 팝업에서 1–20초로 조절
- 팝업에서 휠 방향 반전 가능
- 재생/일시정지 상태 유지
- 볼륨 슬라이더의 기존 입력 유지
- VOD, 광고, DVR 라이브는 실제 탐색 가능한 범위 안에서 이동

## 빌드와 검사

Node.js 18 이상이 필요합니다. 외부 패키지는 사용하지 않습니다.

```bash
npm test
npm run package
```

생성 결과:

- `dist/chrome`
- `dist/firefox`

## Chrome에 설치

1. `npm run package`를 실행합니다.
2. `chrome://extensions`를 엽니다.
3. **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
5. `dist/chrome` 디렉터리를 선택합니다.

## Firefox에 설치

Firefox 140 이상이 필요합니다. 확장은 설정값을 브라우저 동기화 저장소에만 보관하며 외부로 전송하지 않습니다.

1. `npm run package`를 실행합니다.
2. `about:debugging#/runtime/this-firefox`를 엽니다.
3. **임시 부가 기능 로드**를 선택합니다.
4. `dist/firefox/manifest.json`을 선택합니다.

임시 부가 기능은 Firefox를 종료하면 제거됩니다. 영구 배포에는 Mozilla 서명이 필요합니다.

## 사용

1. YouTube 영상을 엽니다.
2. 포인터를 플레이어 위에 둡니다.
3. 가로 휠을 오른쪽으로 돌리면 앞으로, 왼쪽으로 돌리면 뒤로 이동합니다.
4. 확장 아이콘을 눌러 감도와 방향을 변경합니다.

볼륨 슬라이더 위에서는 확장이 가로 휠 이벤트를 처리하지 않습니다. 일반 세로 휠과 플레이어 밖의 가로 휠도 변경하지 않습니다.

## 개발 구조

- `src/content/wheel-normalizer.js`: WheelEvent 단위 정규화와 탐색 범위 계산
- `src/content/settings.js`: 동기화 설정 저장소
- `src/content/youtube-wheel.js`: YouTube 플레이어 이벤트 처리
- `src/popup`: 감도와 방향 설정 UI
- `scripts/package.mjs`: 브라우저별 배포 디렉터리 생성
