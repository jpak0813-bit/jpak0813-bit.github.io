# 테스트

`index.html`을 jsdom으로 실제 실행하고, 네트워크(ntfy · Firebase · Gemini)는 가짜로 바꿔서 검사합니다.

```bash
cd tests
npm install
npm test
```

검사 항목:

- 기본: 출입증 발급, 4탭, 현장맵(구역 4개·인력 명단), 무전 전송, 작업 추가/진행/완료/삭제, 인력 상태·구역 변경
- `@제미나이`: 칩 노출 · 키 없을 때 안내 배너(호출 안 함) · 키 저장(localStorage `nogada_gemini_api_key`) · 정상 호출(systemInstruction·최근 무전 맥락 포함) · 인력 상태 `작업중`→`대기중` · 모델 폴백 · 키 오류(400) 안내 메시지
  - 폴백 순서 `gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash → gemini-flash-latest`
  - 404(모델 없음) · **503(수요 폭주)** · 429(한도) · 망 지연/시간초과에도 다음 모델로 넘어가 답을 찾는지
  - 4개가 모두 503이면 안내 무전 1건만 올리고 상태가 `대기중`으로 돌아오는지
  - 2.5 계열 요청에만 `thinkingConfig.thinkingBudget=0`이 붙고 2.0 계열에는 없는지(400 방지)
- 보안: API 키가 어떤 외부 페이로드(ntfy/Firebase)에도 실리지 않는지
- `@Cue`: 인력 카드 · 복사 문구에 Firebase `GET/POST .../messages.json` 주소와 `from:"cue", name:"Cue", emoji:"🕶️"` 규칙이 들어 있는지

테스트는 실제 Firebase에 쓰지 않습니다(`?db=off` 또는 가짜 fetch). 실서비스 확인은 배포 후 사이트에서 직접 하세요.
