# 테스트

`index.html`을 jsdom으로 실제 실행하고, 네트워크(ntfy · Firebase · Gemini · Groq)는 가짜로 바꿔서 검사합니다.

```bash
cd tests
npm install
npm test
```

검사 항목:

- 스마트 오피스 맵: **미니 캐릭터 4종 SVG**(로엔 초록 피클+안전모+ㄹ·빈나 하트+클립보드·제미나이 로봇+안테나·그록 후드+번개) · 이모지 원 제거 · 인력 카드/상태판/무전기 칩에도 같은 캐릭터 · 40×46px·숨쉬기·고개·깜빡임·걷기 키프레임 · 작업중 바운스 · 걷는 동안 1.4초 이동 · prefers-reduced-motion
- 자율 이동(어슬렁): 대기중 캐릭터마다 시작 시각이 어긋남 · 때가 되면 라운지 범위(51~92%/54~86%) 안 새 자리로 출발 · 걷는 동안 `walking` 클래스 · 작업중이 되면 순찰 중지·책상으로 · 좌우 방향 전환
- 봇 이름 변경: 인력 카드/캐릭터 카드의 ✏️ · 이름·직책 저장(agents/{id} + customName + 편집 시각) · 지도 이름표·지금 오피스·무전기 발신자·멘션 칩 즉시 반영 · `@새이름`·`@제미나이`·`@gemini` 모두 같은 봇 호출 · 기본값 복원
- 이름 유지: 새로 열어도 저장된 이름 그대로 · 씨앗/CORE_AGENTS 재투입과 다른 기기의 낡은 기록이 새 이름을 덮지 않음 · 다른 기기에서 바꾼 새 이름은 받아들임
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
- 모바일 레이아웃(CSS 계약): body `100dvh` 앱 셸 · main 스크롤 · 무전기 탭/카드가 남는 높이 채움 · 현장맵 탭과 `지금 오피스` 상태판이 남는 높이를 채움 · 맵 그림 4:3·어두운 배경 · 하단 탭바가 fixed가 아니라 흐름의 마지막(안전영역 포함)
- 스마트 오피스 맵: 캐릭터 5명 렌더 · 대기중→idle(라운지 자리·☕/💤) · 합류대기→joining 펄스 · 작업중→working(⚡·자기 구역 책상 이동·구역 이름표 busy) · 대기 복귀 시 라운지로 · 식사중→🍽️ · 캐릭터 탭 시 상태 토스트·강조 · 구역 내부 키(office/work/yard/break) 유지 · 구역 시트 · 캐릭터 이동 transition 0.8s·breathe/workBob/joinPulse 키프레임·prefers-reduced-motion
- Cue 제거: 인력 카드·문구 복사 버튼·지도 캐릭터·출근 집계에서 빠짐(저장된 명단·RTDB에 남아 있어도 무시, 서버 삭제 없음)
- 🔐 Google 로그인(가짜 Firebase Auth 주입): 로그인 전 게이트·RTDB 호출 0건 · 로그인 후 게이트 해제·`?auth=` 토큰 전달·헤더 계정 표시 · 인력 현황 접근 권한 카드·로그아웃 · 현장주에게만 허용 이메일 추가칸 · 401(권한 없는 계정) → 게이트 + 사유·계정 표시

테스트는 실제 Firebase에 쓰지 않습니다(`?db=off` 또는 가짜 fetch). 실서비스 확인은 배포 후 사이트에서 직접 하세요.
