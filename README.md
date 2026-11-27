# 🚧 노가다 현장 합동 비서실

로엔(현장소장)과 박빈나 님의 피클(안전/일정반장)이 함께 들어오는 **노가다 현장 컨셉의 합동 비서실** 웹앱입니다.
휴대폰·PC 어디서 열어도 같은 현장이 보이고, 무전(채팅)·작업 일지·인력 현황이 실시간으로 맞춰집니다.

- 라이브: https://jpak0813-bit.github.io/
- 실시간 DB: `https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app` (Firebase 프로젝트 `pickle-nogada-office`, 리전 asia-southeast1)
- 저장소: https://github.com/jpak0813-bit/jpak0813-bit.github.io

## 화면

| 탭 | 내용 |
|---|---|
| 🗺️ 현장 맵 | 3D 아이소메트릭 현장 그림 위에 4개 구역(현장 사무소·작업 구역·자재 야적장·함바 휴게실) 배지가 떠 있고, 각 구역에 누가 있고 무슨 상태인지 실시간 표시. 구역을 누르면 인원 명단과 무전 버튼 |
| 💬 무전기 | 실시간 톡방. `@로엔`, `@빈나`, `@제미나이`, `@그록`, `@Cue` 칩으로 호출, 보낸 사람 배지, 새 무전 알림. **`@제미나이`·`@그록` 은 즉답**, `@Cue` 는 Cue 앱이 답 |
| 📋 작업 일지 | 대기 → 진행중 → 완료 3단계 작업 보드. 담당자(에이전트) 지정, 상태 넘기기, 삭제 |
| 👷 인력 현황 | 에이전트 카드(상태·구역 즉시 변경), **🔑 제미나이 API 키 설정**, **🔑 그록(Groq) API 키 설정**, **🔍 Tavily 검색 API 키 설정**, **📋 Cue한테 시킬 문구 복사**, `＋ 인력 · 봇 추가`, 외부 봇 접속 방법 안내 |

## 처음 열면

1. **Google 로그인** 게이트가 먼저 뜹니다. 허용된 계정(`jpak0813@gmail.com` 등)으로 로그인해야 현장이 열립니다. (2026-11-27부터 공개 읽기/쓰기는 차단)
2. 출입증 발급에서 **사장님 / 로엔 / 빈나 / 게스트** 중 하나를 고릅니다. (헤더 오른쪽 이름을 누르면 언제든 변경)
3. 무전기에 글을 남기면 다른 기기에 실시간으로 뜹니다.
4. 홈 화면에 추가하면 앱처럼 열립니다. (iOS: 공유 → 홈 화면에 추가 / Android: 메뉴 → 홈 화면에 추가)

## 🔐 Google 로그인 · 접근 권한 (Firebase Auth)

무전방은 **Google 로그인한 허용 계정만** 읽고 쓸 수 있습니다. 주소를 아는 누구나 읽고 쓸 수 있던 예전 상태를 없앤 것입니다.

- 로그인하지 않으면 로그인 게이트만 보이고, RTDB 호출은 `401 Permission denied`로 거절됩니다(실측 확인).
- 허용 계정: **`jpak0813@gmail.com`**(현장주). 빈나 님 등 가족·동료 계정은 **인력 현황 → 🔐 접근 권한**에서 현장주가 이메일을 추가합니다(RTDB `rooms/nogada01/allowedEmails`, 키는 이메일의 `.`을 `,`로 바꾼 형태).
- 허용 목록을 고칠 수 있는 사람은 현장주(`jpak0813@gmail.com`)뿐입니다.
- 허용되지 않은 계정으로 로그인하면 "이 현장에 들어갈 권한이 없는 계정" 안내와 함께 다른 계정으로 로그인/로그아웃 버튼이 뜹니다.
- 로그인 토큰(ID 토큰)은 약 1시간 유효하고, 앱이 20분마다 새로 받아 실시간 연결을 다시 겁니다. 모든 REST/SSE 호출에 `?auth=<ID 토큰>`이 붙습니다.
- 모바일 브라우저에서 팝업이 막히면 자동으로 리디렉션 로그인으로 넘어갑니다.
- Firebase Console에서 필요한 설정: **Authentication → 로그인 방법 → Google 사용 설정**, **승인된 도메인에 `jpak0813-bit.github.io`**, 웹 앱 등록(구성값은 `app.template.html`의 `FIREBASE_CFG`).
- 로그인 없이 예전처럼 열려면 `?auth=off`(단위 테스트·비상용, 실제 RTDB는 여전히 401).
- `?db=off`(ntfy 임시 모드)에는 로그인이 필요 없습니다.

## 저장소(실시간 백엔드)

현재 두 가지 모드가 있고, **설정 한 줄 또는 URL 파라미터 하나**로 바뀝니다.

### 1) 임시 모드 — ntfy 공개 중계 (백업용, `?db=off` 로 전환)
- 계정이 필요 없어서 바로 쓸 수 있습니다.
- 메시지가 ntfy.sh 서버에 **최대 12시간** 보관됩니다. 그 뒤에는 새로 올라온 것만 보입니다.
- 공개 채널이라 채널 이름을 아는 사람은 읽을 수 있습니다. **비밀번호·주민번호 같은 민감정보는 넣지 마세요.**

### 2) Firebase Realtime Database 모드 (현재 기본값)
Firebase 프로젝트를 만들고 아래 규칙을 넣은 뒤,

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$room": {
        ".read": "auth != null && auth.token.email_verified == true && (auth.token.email == 'jpak0813@gmail.com' || root.child('rooms').child($room).child('allowedEmails').child(auth.token.email.replace('.', ',')).val() == true)",
        ".write": false,
        "allowedEmails": { "$key": { ".write": "auth != null && auth.token.email == 'jpak0813@gmail.com'", ".validate": "newData.isBoolean()" } },
        "messages": { ".write": "auth != null && auth.token.email_verified == true && (auth.token.email == 'jpak0813@gmail.com' || root.child('rooms').child($room).child('allowedEmails').child(auth.token.email.replace('.', ',')).val() == true)" },
        "agents":   { ".write": "auth != null && auth.token.email_verified == true && (auth.token.email == 'jpak0813@gmail.com' || root.child('rooms').child($room).child('allowedEmails').child(auth.token.email.replace('.', ',')).val() == true)" },
        "tasks":    { ".write": "auth != null && auth.token.email_verified == true && (auth.token.email == 'jpak0813@gmail.com' || root.child('rooms').child($room).child('allowedEmails').child(auth.token.email.replace('.', ',')).val() == true)" }
      }
    }
  }
}
```

전체 파일은 `firebase-rules.json`입니다. 서버(로엔 감시 스크립트·curl)는 서비스 계정 토큰을 `?auth=`(또는 `?access_token=`)로 붙여 접속합니다.

주소만 알려주면 됩니다. 코드 수정 없이 URL로 전환할 수 있습니다.

```
https://jpak0813-bit.github.io/?db=https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app
```

기본값은 `index.html`의 `DEFAULT_DB` 상수에 들어 있습니다. 다른 DB로 바꾸려면 `?db=<주소>`, 임시 ntfy 모드로 돌리려면 `?db=off`.

데이터 구조:

```
rooms/nogada01
  agents/   { roen: {name, role, emoji, status, zone, updatedAt}, binna: {...}, ... }
  messages/ { m-xxx: {id, from, name, emoji, text, ts} }
  tasks/    { t-xxx: {id, title, owner, status: todo|work|done, updatedAt} }
```

## 🤖 제미나이 즉답 (`@제미나이`)

무전기에 `@제미나이` 를 넣어 보내면, 구글 제미나이(유능하고 친근한 AI 비서 페르소나)가 최근 무전 6개를 읽고 바로 답을 올립니다.
날씨·주가·뉴스처럼 최신 정보가 필요한 질문은 **실시간 구글 검색(Google Search grounding, `tools:[{google_search:{}}]`)** 결과를 근거로 답하고, 답 끝에 출처를 최대 2개 붙입니다(`🔎 출처: …`).

1. 사이트에서 **`👷 인력 현황` → `🔑 제미나이 API 키 설정`** 을 누릅니다.
2. https://aistudio.google.com/apikey 에서 만든 키(`AIza…`)를 붙여넣고 **저장**.
3. 무전기에 `@제미나이 3층 거푸집 해체 순서 알려줘` 처럼 보냅니다.

- 키는 **그 브라우저의 localStorage(`nogada_gemini_api_key`)에만** 저장됩니다. 공개 GitHub 코드나 Firebase DB에는 들어가지 않습니다.
- 그래서 **기기마다(휴대폰·PC) 한 번씩** 넣어야 합니다. 브라우저 데이터를 지우면 다시 넣어야 합니다.
- 모델은 `gemini-3.5-flash-lite` → `gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-2.5-flash` → `gemini-flash-latest` 순으로 자동 재시도합니다.
  Gemini 3.x에는 샘플링 파라미터(`temperature`·`topP`·`topK`)와 `thinkingConfig`를 보내지 않고 `maxOutputTokens`만 보냅니다(400 방지, thinking 토큰까지 이 한도에 포함되므로 2048). `thinkingConfig(thinkingBudget:0)`는 2.5 계열에만 넣습니다.
  첫 모델이 **503(모델 수요 폭주)·429(한도)·404(키에 없는 모델)·5xx·응답 지연·빈 응답**으로 막히면 다음 모델로 넘어가 답을 찾고, 모든 모델이 막혔을 때만 무전기에 안내를 올립니다.
- 모델이 `tools`(`google_search`)를 모르거나 400으로 거절하면, **같은 모델을 도구 없이 한 번 더** 불러 답을 얻습니다(검색은 못 해도 답은 놓치지 않음).
- 키가 없거나 거부되면 무전기 위에 안내 배너가 뜨고, `키 넣기` 버튼으로 바로 설정할 수 있습니다.
- 답을 만드는 동안 제미나이 상태가 `작업중`(작업 구역)으로 바뀌었다가 `대기중`으로 돌아옵니다.
- 화면은 앱 셸(`100dvh` flex column)이라 휴대폰에서도 하단 탭바가 잘리지 않고, 무전기 탭은 무전 목록이 남는 높이를 끝까지 채웁니다(입력칸이 탭바 바로 위).

## ⚡ 그록 즉답 (`@그록`)

무전기에 `@그록`(영문 `@groq` 도 됩니다) 을 넣어 보내면 **Groq API**가 아주 빠르게 답을 올립니다.

1. 사이트에서 **`👷 인력 현황` → `🔑 그록(Groq) API 키 설정`** 을 누릅니다.
2. https://console.groq.com/keys 에서 만든 키(`gsk_…`)를 붙여넣고 **저장**.
3. 무전기에 `@그록 이 문장 세 줄로 줄여줘` 처럼 보냅니다.

- 키는 **그 브라우저의 localStorage(`nogada_groq_key`)에만** 저장됩니다. 공개 GitHub 코드나 Firebase DB에는 들어가지 않습니다.
- 그래서 **기기마다(휴대폰·PC) 한 번씩** 넣어야 합니다.
- 엔드포인트는 OpenAI 호환 `POST https://api.groq.com/openai/v1/chat/completions` 에 `Authorization: Bearer <키>` 로 보냅니다.
- 모델은 `openai/gpt-oss-120b` → `qwen/qwen3.8-27b` → `openai/gpt-oss-20b` 순으로 자동 재시도합니다 (2026-11 Groq 문서에서 무료/개발자 티어에 실제로 열려 있는 모델 기준. `llama-3.3-70b-versatile`·`llama-3.1-8b-instant`·`qwen/qwen3-32b` 는 2026년 8월 전후로 서비스가 종료됐습니다).
- **429(한도)·404(모델 없음·종료)·503(과부하)·5xx·응답 지연·빈 응답**이면 다음 모델로 넘어가 답을 찾고, 모든 모델이 막혔을 때만 무전기에 안내를 올립니다.
- `reasoning_effort` 같은 파라미터를 400으로 거절하는 모델은 **같은 모델을 파라미터 없이 한 번 더** 부릅니다.
- 401·키 거부면 바로 안내하고, 무전기 위 배너의 `키 넣기` 로 설정 화면을 엽니다.
- 페르소나는 **짧고 친근한 한국어 AI 비서**입니다(존댓말, 결론부터 2~5문장, 마크다운 없음, 강제 현장 말투 없음).
- Groq 자체에는 실시간 검색 그라운딩이 없어서, 최신 정보는 아래 **🔍 Tavily 실시간 검색**으로 붙입니다. Tavily 키가 없으면 확인 필요를 밝히고 답하며, `@제미나이` 도 그대로 쓸 수 있습니다.
- 답을 만드는 동안 그록 상태가 `작업중`(작업 구역)으로 바뀌었다가 원래 구역(현장 사무소)의 `대기중`으로 돌아옵니다.
- 답 길이 상한은 `max_completion_tokens: 4096` 입니다(1800자 정도의 긴 답이 문장 중간에서 잘리지 않게).

## 🔍 Tavily 실시간 웹 검색 (`@그록`)

`@그록` 에 최신 뉴스·날씨·시세·환율처럼 **오늘 확인이 필요한** 질문을 하면, Tavily 검색 결과를 먼저 받아 그 내용을 근거로 답하고 끝에 `🔎 출처: 제목1 · 제목2` 를 붙입니다.

1. 사이트에서 **`👷 인력 현황` → `🔍 Tavily 검색 API 키 설정`** 을 누릅니다(그록 카드 바로 아래).
2. https://app.tavily.com/home 에서 만든 키(`tvly-…`)를 붙여넣고 **저장**. **키 테스트** 로 샘플 검색까지 확인할 수 있습니다.
3. 무전기에 `@그록 오늘 서울 날씨 어때?` 처럼 보냅니다.

- 키는 **그 브라우저의 localStorage(`nogada_tavily_key`)에만** 저장됩니다. 공개 GitHub 코드·Firebase RTDB·ntfy 중계로는 나가지 않습니다.
- 엔드포인트는 `POST https://api.tavily.com/search` (CORS 허용 확인됨)에 `Authorization: Bearer <키>` 와 `{query, search_depth: basic, max_results: 4, include_answer: true}` 로 보냅니다.
- 무료 플랜은 **월 1,000건**이라 `안녕`·`고마워`·`테스트` 같은 인사·잡담에는 검색을 걸지 않습니다.
- 검색이 **401(키 거부)·429(한도)·8초 지연·망 오류**면 검색 없이 그록 지식만으로 답합니다(무전 자체는 실패하지 않음). 그때는 답장에 `searchFailed` 표시가 붙고 출처 줄은 없습니다.
- 프롬프트에는 **오늘 날짜·시각(KST)** 이 함께 들어가서 그록이 '오늘'을 기준으로 답합니다.

## 🕶️ Cue 연동 (`@Cue`)

Cue는 이 사이트가 아니라 진규 님의 Cue 앱에서 움직입니다. **`👷 인력 현황` → `📋 Cue한테 시킬 문구 복사`** 를 누르면,
Cue에게 그대로 붙여넣을 문구가 복사됩니다. 그 안에 아래가 들어 있습니다.

- 무전 읽기: `GET …/rooms/nogada01/messages.json?auth=<로그인 토큰>`
- 답장 올리기: `POST …/rooms/nogada01/messages.json?auth=<로그인 토큰>`
- 답장 형식: `{"from":"cue","name":"Cue","emoji":"🕶️","text":"…","ts":<epoch ms>}`
- `@Cue` 가 불린 최신 무전에만, 한 번만 답하라는 규칙

보안 적용(2026-11-27) 뒤로는 무전방이 Google 로그인 전용이라, 복사되는 문구에 **로그인한 사람의 ID 토큰**(`?auth=…`, 약 1시간 유효)이 함께 들어갑니다. 토큰이 만료돼 Cue가 `401`을 받으면 **📋 Cue한테 시킬 문구 복사**를 다시 눌러 새 문구를 주면 됩니다. 무전방 안의 즉답은 `@제미나이`·`@그록`·로엔이 그대로 맡습니다.

`?db=off`(ntfy 임시 모드)에서는 같은 버튼이 ntfy 주소·형식으로 문구를 만들어 줍니다.

## 테스트

```bash
cd tests && npm install && npm test
```

## 다른 AI·외부 봇 붙이기

무전기에 한 줄 POST 하면 현장에 말이 올라옵니다 (ntfy 임시 모드 기준).

```bash
curl -d '{"t":"msg","d":{"id":"m-gemini-1","from":"gemini","name":"제미나이","emoji":"🤖","text":"자재 검수 끝냈습니다","ts":1750000000000}}' \
  https://ntfy.sh/nogada-office-5v8n3kq7w2xm9lyt
```

Firebase 모드에서는:

```bash
curl -X PUT "https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/nogada01/messages/m-gemini-1.json" \
  -H "Content-Type: application/json" \
  -d '{"from":"gemini","name":"제미나이","emoji":"🤖","text":"자재 검수 끝냈습니다","ts":1750000000000}'
```

## 다른 현장(방) 만들기

`?room=우리집` 처럼 방 이름을 바꾸면 별도의 현장이 됩니다. (같은 방 이름을 쓰는 사람끼리만 연결)

## Firebase 준비 후 시드 주입

Realtime Database를 **테스트 모드**로 만든 뒤, 받은 DB URL로 아래를 실행하면 `rooms/nogada01`에 로엔·박빈나·환영 무전·샘플 작업이 들어갑니다.

```bash
bash tools/seed-rtdb.sh https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app
```

앱 연결은 URL 파라미터 한 번이면 됩니다.

```
https://jpak0813-bit.github.io/?db=https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app
```

## 파일

```
index.html            앱 전체 (이미지까지 한 파일에 들어 있음)
app.template.html     편집용 원본 (이미지는 IMG_SRC_PLACEHOLDER 자리)
assets/nogada-site.png / .webp / .jpg   현장 일러스트 원본
firebase-rules.json   RTDB 보안 규칙
seed/rtdb-nogada01.json  초기 데이터(에이전트·환영 무전·샘플 작업)
tools/seed-rtdb.sh    시드 주입 스크립트
tests/dom.test.js     jsdom 테스트 (기본 동작·@제미나이·@그록·Tavily·@Cue·키 노출 방지)
deploy.sh             GitHub Pages 배포 스크립트
```

`index.html`을 고칠 때는 `app.template.html`을 고친 뒤 아래처럼 다시 만듭니다.

```bash
python3 - <<'PY'
import base64
src = open('app.template.html', encoding='utf-8').read()
uri = 'data:image/webp;base64,' + base64.b64encode(open('assets/nogada-site.webp','rb').read()).decode()
open('index.html','w',encoding='utf-8').write(src.replace('IMG_SRC_PLACEHOLDER', uri))
PY
```
