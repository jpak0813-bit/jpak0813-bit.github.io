# 테스트

`index.html`을 jsdom으로 실제 실행하고, 네트워크(ntfy · Firebase · Gemini · Groq)는 가짜로 바꿔서 검사합니다.

```bash
cd tests
npm install
npm test
```

검사 항목:

- 기본: 출입증 발급, 4탭, 현장맵(구역 4개·인력 명단), 무전 전송, 작업 추가/진행/완료/삭제, 인력 상태·구역 변경
- `@제미나이`: 칩 노출 · 키 없을 때 안내 배너(호출 안 함) · 키 저장(localStorage `nogada_gemini_api_key`) · 정상 호출(systemInstruction·최근 무전 맥락 포함) · 인력 상태 `작업중`→`대기중` · 모델 폴백 · 키 오류(400) 안내 메시지
  - 페르소나: 일반 AI 비서(강제 현장 반장 말투 없음) · 정중한 존댓말 · 검색 근거 지시
  - 실시간 검색: 요청 본문에 `tools:[{google_search:{}}]`가 실리는지 / 그라운딩 결과의 출처가 답 끝에 최대 2개 붙는지
  - `tools`를 400으로 거절하는 모델이면 **같은 모델을 도구 없이 재시도**해 답을 얻는지
  - 폴백 순서 `gemini-3.5-flash-lite → gemini-3.6-flash → gemini-3.8-flash → gemini-2.5-flash → gemini-flash-latest`
  - 404(모델 없음) · **503(수요 폭주)** · 429(한도) · 망 지연/시간초과 · 본문이 빈 200 응답에도 다음 모델로 넘어가 답을 찾는지
  - 모두 503이면 안내 무전 1건만 올리고 상태가 `대기중`으로 돌아오는지
  - 400이어도 `thinkingConfig` 같은 파라미터를 모르는 모델이면 다음 모델로 넘어가는지
  - 3.x 요청에는 `temperature`·`topP`·`thinkingConfig`가 없고 `maxOutputTokens`만 있는지 / 2.5 요청에만 `thinkingConfig.thinkingBudget=0`이 붙는지
- 보안: API 키가 어떤 외부 페이로드(ntfy/Firebase)에도 실리지 않는지
- `@그록`(Groq): 칩·인력 카드 · 키 없을 때 안내 배너(호출 안 함) · 키 저장(localStorage `nogada_groq_key`) · OpenAI 호환 본문(`messages` system/user·`temperature`·`max_completion_tokens`·`stream:false`·gpt-oss `reasoning_effort:low`) · `Authorization: Bearer` 헤더 · 엔드포인트 `https://api.groq.com/openai/v1/chat/completions` · 답장(from `groq`, ⚡ 그록, `model` 필드) · 상태 `작업중`→`대기중`(원래 구역)
  - 폴백 순서 `openai/gpt-oss-120b → qwen/qwen3.8-27b → openai/gpt-oss-20b`, 429·404·503·빈 응답에서 다음 모델로
  - 모든 모델 503 → 안내 무전 1건 + 상태 복귀 / 401 키 오류 → 바로 안내 + 배너 (다른 모델 재시도 안 함)
  - 400 `reasoning_effort` 거절 → 같은 모델을 파라미터 없이 재시도 / `@groq` 영문 멘션도 동작
- 제미나이 키 설정 시트: `AIza…` 와 `AQ.…` 두 키 형식을 모두 안내
- 모바일 레이아웃(CSS 계약): body `100dvh` 앱 셸 · main 스크롤 · 무전기 탭/카드가 남는 높이 채움 · 하단 탭바가 fixed가 아니라 흐름의 마지막(안전영역 포함)
- `@Cue`: 인력 카드 · 복사 문구에 Firebase `GET/POST .../messages.json` 주소와 `from:"cue", name:"Cue", emoji:"🕶️"` 규칙이 들어 있는지

테스트는 실제 Firebase에 쓰지 않습니다(`?db=off` 또는 가짜 fetch). 실서비스 확인은 배포 후 사이트에서 직접 하세요.
