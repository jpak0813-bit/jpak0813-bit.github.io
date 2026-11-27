/* 노가다 현장 합동 비서실 — DOM/유닛 테스트
 * 실행: npm i (tests 폴더) 후  node tests/dom.test.js
 *   jsdom으로 index.html을 실제로 띄우고, 네트워크(ntfy/Firebase/Gemini)는 가짜로 바꿔서 검사합니다.
 *   - 기본 앱 동작(맵·무전기·작업일지·인력현황)
 *   - @제미나이 즉답: 키 없음 안내 / 키 저장(localStorage) / 정상 호출 / 모델 폴백(404·503·429·망 지연) / 키 오류
 *   - @그록(Groq) 즉답: 칩·키 없음 안내 / localStorage 키 / OpenAI 호환 페이로드·Bearer 헤더 / 모델 폴백 / 키 오류
 *   - 키가 소스·Firebase 페이로드에 절대 섞이지 않는지
 *   - @Cue 인력·칩·"Cue한테 시킬 문구 복사"
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FAKE_KEY = 'AIzaSyTESTKEY_do_not_leak_1234567890';
const FAKE_GROQ_KEY = 'gsk_TESTKEY_do_not_leak_1234567890abcdef';
const FAKE_TAVILY_KEY = 'tvly-TESTKEY-do-not-leak-1234567890';
const FB = 'https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app';

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => results.push((cond ? 'PASS' : 'FAIL') + ' · ' + name + (extra ? ' — ' + extra : ''));

function boot(opts = {}) {
  const published = [];       // 앱이 밖으로 내보낸 모든 페이로드(ntfy/Firebase)
  const geminiCalls = [];     // Gemini API 호출 기록
  const groqCalls = [];       // Groq API 호출 기록
  const tavilyCalls = [];     // Tavily Search API 호출 기록
  const fbCalls = [];         // Firebase RTDB REST 호출 기록
  const copied = [];
  const fbResponder = opts.fbResponder || (() => ({ ok: true, json: async () => ({}), text: async () => '' }));
  const geminiResponder = opts.geminiResponder || (() => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '거푸집은 위에서부터 한 단씩 내려오면 됩니다. 안전대 먼저 겁니다.' }] } }] })
  }));
  const groqResponder = opts.groqResponder || (() => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ index: 0, message: { role: 'assistant', content: '거푸집은 위에서부터 한 단씩 내려오면 됩니다. 안전대 먼저 겁니다.' }, finish_reason: 'stop' }] })
  }));
  const tavilyResponder = opts.tavilyResponder || (() => ({
    ok: true, status: 200,
    json: async () => ({
      query: '서울 날씨',
      answer: '오늘 서울은 맑고 낮 최고 13도입니다.',
      results: [
        { title: '기상청 날씨누리', url: 'https://www.weather.go.kr/main', content: '서울 낮 최고 13도, 밤 최저 2도.' },
        { title: '연합뉴스', url: 'https://www.yna.co.kr/view/1', content: '수도권 맑음, 미세먼지 보통.' },
        { title: '세 번째 출처', url: 'https://example.com/x', content: '세 번째 결과' }
      ],
      response_time: '0.8'
    })
  }));

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || ('https://example.test/?db=off&ch=nogada-test-' + Math.random().toString(36).slice(2, 8)),
    beforeParse(window) {
      window.fetch = async (url, opt = {}) => {
        const u = String(url);
        if (u.includes('generativelanguage.googleapis.com')) {
          const call = { url: u, body: opt.body ? JSON.parse(opt.body) : null };
          geminiCalls.push(call);
          return geminiResponder(call, geminiCalls.length);
        }
        if (u.includes('api.tavily.com')) {
          const call = { url: u, headers: opt.headers || {}, body: opt.body ? JSON.parse(opt.body) : null, signal: opt.signal };
          tavilyCalls.push(call);
          return tavilyResponder(call, tavilyCalls.length);
        }
        if (u.includes('api.groq.com')) {
          const call = { url: u, headers: opt.headers || {}, body: opt.body ? JSON.parse(opt.body) : null };
          groqCalls.push(call);
          return groqResponder(call, groqCalls.length);
        }
        if (u.includes('ntfy.sh') && u.includes('/json?poll=1')) return { ok: true, text: async () => '' };
        if (u.includes('firebasedatabase.app')) {
          const call = { url: u, method: opt.method || 'GET', body: opt.body ? JSON.parse(opt.body) : null };
          fbCalls.push(call);
          return fbResponder(call, fbCalls.length);
        }
        if (u.includes('ntfy.sh') && opt.method === 'POST') {
          try { published.push(JSON.parse(opt.body)); } catch (e) {}
          return { ok: true, json: async () => ({}) };
        }
        if (opt.body) { try { published.push(JSON.parse(opt.body)); } catch (e) {} }
        return { ok: true, json: async () => ({}), text: async () => '' };
      };
      window.EventSource = class {
        constructor() { this.onmessage = null; this.onopen = null; this.onerror = null; setTimeout(() => this.onopen && this.onopen(), 5); }
        addEventListener() {}
        close() {}
      };
      window.confirm = () => true;
      if (opts.firebase) window.firebase = opts.firebase;
      window.requestAnimationFrame = cb => setTimeout(() => cb(0), 0);
      window.scrollTo = () => {};
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async t => { copied.push(t); } }
      });
    }
  });
  return { dom, w: dom.window, d: dom.window.document, published, geminiCalls, groqCalls, tavilyCalls, fbCalls, copied };
}

/* Firebase Auth 흉내 — 실제 SDK 없이 로그인 상태 변화를 시험합니다. */
function fakeFirebase() {
  const api = { apps: [], config: null, listeners: [], user: null };
  const instance = {
    onAuthStateChanged(cb) { api.listeners.push(cb); },
    getRedirectResult: async () => null,
    signOut: async () => { api.user = null; api.listeners.forEach(f => f(null)); },
    signInWithPopup: async () => { throw Object.assign(new Error('no popup'), { code: 'auth/popup-closed-by-user' }); },
    signInWithRedirect: async () => {}
  };
  const authFn = () => instance;
  authFn.GoogleAuthProvider = class { setCustomParameters() {} };
  api.initializeApp = cfg => { api.config = cfg; };
  api.auth = authFn;
  api.signIn = async (email) => {
    const user = { email, uid: 'uid-' + email, getIdToken: async () => 'test-id-token' };
    api.user = user;
    api.listeners.forEach(f => f(user));
    return user;
  };
  return api;
}

(async () => {
  /* ============ 1) 기본 앱 + 새 인력(제미나이·Cue) ============ */
  {
    const { dom, w, d } = boot();
    await wait(160);
    ok('title', d.title === '노가다 현장 합동 비서실', d.title);
    ok('tab count 4', d.querySelectorAll('.tab').length === 4);
    ok('identity sheet on first open', d.querySelector('#overlay').classList.contains('on'));
    ok('identity options 4', d.querySelectorAll('[data-me]').length === 4);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(40);
    ok('identity closed', !d.querySelector('#overlay').classList.contains('on'));
    ok('me label', d.querySelector('#meName').textContent === '사장님');
    ok('map img data-uri', (d.querySelector('.mapwrap img').getAttribute('src') || '').startsWith('data:image/webp;base64,'));
    ok('4 zone badges', d.querySelectorAll('.zone').length === 4, String(d.querySelectorAll('.zone').length));
    ok('map lists 제미나이', d.querySelector('#view-map').textContent.includes('제미나이'));
    ok('map lists Cue', d.querySelector('#view-map').textContent.includes('Cue'));

    // 무전기: @제미나이 / @Cue 칩
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(40);
    const chips = [...d.querySelectorAll('[data-mention]')].map(b => b.dataset.mention);
    ok('chip @제미나이', chips.includes('제미나이'), chips.join(','));
    ok('chip @Cue', chips.includes('Cue'), chips.join(','));
    ok('welcome message', d.querySelector('#view-chat').textContent.includes('현장 사무소 개설 완료'));
    ok('chat: 무전 목록이 남는 높이를 채우는 카드', !!d.querySelector('#view-chat .chatcard .chat-scroll'));
    dom.window.close();
  }

  /* ============ 2) @제미나이 — 키 없음 ============ */
  {
    const { dom, d, published, geminiCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    const inp = d.querySelector('#msgInput');
    inp.value = '@제미나이 3층 거푸집 해체 순서 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(400);
    ok('no-key: 내 무전은 올라감', published.some(p => p.t === 'msg' && String(p.d.text).includes('거푸집')));
    ok('no-key: Gemini 호출 안 함', geminiCalls.length === 0, 'calls=' + geminiCalls.length);
    ok('no-key: 도움 배너 표시', !!d.querySelector('.aibanner') && d.querySelector('.aibanner').textContent.includes('API 키'));
    ok('no-key: 배너에 키 넣기 버튼', !!d.querySelector('#aiKeyFromChat'));
    ok('no-key: 제미나이 답장 없음', !published.some(p => p.t === 'msg' && p.d.from === 'gemini'));

    // 배너 버튼 → 키 설정 시트
    d.querySelector('#aiKeyFromChat').click();
    await wait(30);
    ok('no-key: 키 설정 시트 열림', d.querySelector('#overlay').classList.contains('on')
      && d.querySelector('#sheet').textContent.includes('제미나이 API 키'));
    ok('no-key: 키 입력칸', !!d.querySelector('#gkInput'));
    dom.window.close();
  }

  /* ============ 3) 키 저장 → 호출 → 답장 → 상태 복귀 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);

    // 인력 현황 → 🔑 제미나이 API 키 설정
    d.querySelector('.tab[data-tab="crew"]').click();
    await wait(40);
    const keyBtn = d.querySelector('#geminiKeyBtn');
    ok('crew: 키 설정 버튼', !!keyBtn && keyBtn.textContent.includes('제미나이 API 키 설정'));
    ok('crew: 키 없음 표시', d.querySelector('#view-crew').textContent.includes('키 없음'));
    keyBtn.click();
    await wait(30);
    d.querySelector('#gkInput').value = FAKE_KEY;
    d.querySelector('#gkSave').click();
    await wait(60);
    ok('key saved to localStorage', w.localStorage.getItem('nogada_gemini_api_key') === FAKE_KEY);
    ok('key masked in UI', d.querySelector('#view-crew').textContent.includes('AIzaSy…7890')
      || d.querySelector('#view-crew').textContent.includes('키 등록됨'));
    ok('key NOT in any outgoing payload', !JSON.stringify(published).includes(FAKE_KEY));

    // 무전 보내기 → 제미나이 즉답
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    w.eval(`S.messages['m-ctx-1'] = {id:'m-ctx-1', from:'roen', name:'로엔', emoji:'🦺', text:'자재 야적장 정리 끝냈습니다', ts: Date.now()-5000}; render();`);
    await wait(40);
    const inp = d.querySelector('#msgInput');
    inp.value = '@제미나이 3층 거푸집 해체 순서 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(700);

    ok('gemini called once', geminiCalls.length === 1, 'calls=' + geminiCalls.length);
    const call = geminiCalls[0] || { url: '', body: {} };
    ok('model gemini-3.5-flash-lite', call.url.includes('/models/gemini-3.5-flash-lite:generateContent'));
    ok('key in request url', call.url.includes('key=' + encodeURIComponent(FAKE_KEY)));
    const gen3 = call.body && call.body.generationConfig || {};
    ok('3.x payload: 샘플링 파라미터 없음', gen3.temperature === undefined && gen3.topP === undefined && gen3.topK === undefined,
      JSON.stringify(gen3));
    ok('3.x payload: thinkingConfig 없음', gen3.thinkingConfig === undefined, JSON.stringify(gen3));
    ok('3.x payload: maxOutputTokens 있음', typeof gen3.maxOutputTokens === 'number' && gen3.maxOutputTokens > 0, JSON.stringify(gen3));
    const sys = call.body && call.body.systemInstruction && call.body.systemInstruction.parts[0].text || '';
    ok('persona: 일반 AI 비서', sys.includes('AI 비서') && sys.includes('제미나이'), sys.slice(0, 60));
    ok('persona: 강제 현장 반장 말투 없음', !sys.includes('현장 반장'));
    ok('persona: 정중한 존댓말 지시', sys.includes('존댓말'));
    ok('persona: 검색 근거 지시', sys.includes('구글 검색'));
    ok('tools: google_search 그라운딩 전송',
      !!(call.body && call.body.tools) && JSON.stringify(call.body.tools).includes('google_search'),
      JSON.stringify(call.body && call.body.tools));
    const prompt = call.body && call.body.contents[0].parts[0].text || '';
    ok('context: 이전 무전 포함', prompt.includes('자재 야적장 정리 끝냈습니다'));
    ok('context: 지금 온 무전 포함', prompt.includes('거푸집 해체 순서'));

    ok('agent status 작업중 published', published.some(p => p.t === 'agent' && p.d.id === 'gemini' && p.d.status === '작업중' && p.d.zone === 'work'));
    ok('agent status 대기중 복귀', published.some(p => p.t === 'agent' && p.d.id === 'gemini' && p.d.status === '대기중'));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('reply posted as gemini', !!reply && reply.d.name === '제미나이' && reply.d.emoji === '🤖');
    ok('reply carries model', !!reply && reply.d.model === 'gemini-3.5-flash-lite');
    ok('reply rendered in chat', d.querySelector('#view-chat').textContent.includes('거푸집은 위에서부터'));
    ok('AI tag rendered', !!d.querySelector('.msg.ai .tagai'));
    ok('typing indicator gone', !d.querySelector('.msg.typing'));
    ok('key NOT in reply/payloads', !JSON.stringify(published).includes(FAKE_KEY));
    dom.window.close();
  }

  /* ============ 3-B) tools(google_search) 400 거절 → 같은 모델을 도구 없이 재시도 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.body && call.body.tools) {
          return { ok: false, status: 400, json: async () => ({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown name "tools": Cannot find field.' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '검색 도구 없이도 답합니다.' }] } }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 서울 날씨 어때?';
    d.querySelector('#sendBtn').click();
    await wait(800);
    const seq = geminiCalls.map(c => (c.url.match(/models\/([^:]+)/) || [])[1]);
    ok('tools 400: 같은 모델에 두 번 요청',
      seq.length === 2 && seq[0] === 'gemini-3.5-flash-lite' && seq[1] === 'gemini-3.5-flash-lite', seq.join(' > '));
    ok('tools 400: 첫 요청은 tools 포함', !!(geminiCalls[0] && geminiCalls[0].body.tools));
    ok('tools 400: 재시도에는 tools 없음', !!(geminiCalls[1] && geminiCalls[1].body) && geminiCalls[1].body.tools === undefined);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('tools 400: 같은 모델 답장 게시', !!reply && reply.d.model === 'gemini-3.5-flash-lite'
      && reply.d.text.includes('검색 도구 없이도') && reply.d.error !== true, (reply && reply.d.text) || 'none');
    dom.window.close();
  }

  /* ============ 3-C) 실시간 검색 그라운딩 메타데이터 → 출처 한 줄(최대 2개) ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: () => ({ ok: true, status: 200, json: async () => ({
        candidates: [{
          content: { parts: [{ text: '오늘 서울 낮 최고 13도입니다. 내일은 비 소식이 있습니다.' }] },
          groundingMetadata: {
            webSearchQueries: ['서울 날씨'],
            groundingChunks: [
              { web: { uri: 'https://www.weather.go.kr/main', title: '기상청' } },
              { web: { uri: 'https://www.yna.co.kr/view/1', title: '연합뉴스' } },
              { web: { uri: 'https://example.com/x', title: '세 번째 출처' } }
            ]
          }
        }]
      }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 오늘 서울 날씨 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(600);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('grounding: 요청에 tools 포함', !!(geminiCalls[0] && geminiCalls[0].body.tools));
    ok('grounding: 답 본문 유지 + 출처 추가', !!reply
      && reply.d.text.includes('낮 최고 13도') && reply.d.text.includes('출처') && reply.d.text.includes('기상청')
      && reply.d.text.includes('연합뉴스'), reply && reply.d.text);
    ok('grounding: 출처는 2개까지만', !!reply && !reply.d.text.includes('세 번째 출처'));
    ok('grounding: 답장 모델·상태 정상', !!reply && reply.d.model === 'gemini-3.5-flash-lite' && w.eval('S.geminiBusy') === false);
    dom.window.close();
  }

  /* ============ 4) 모델 폴백(404: 3.5-flash-lite → 3.6-flash → 3.8-flash) ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-3.5-flash-lite')) {
          return { ok: false, status: 404, json: async () => ({ error: { code: 404, status: 'NOT_FOUND', message: 'models/gemini-3.5-flash-lite is not found for API version v1beta' } }) };
        }
        if (call.url.includes('gemini-3.6-flash')) {
          return { ok: false, status: 404, json: async () => ({ error: { code: 404, status: 'NOT_FOUND', message: 'models/gemini-3.6-flash is not found for API version v1beta' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '폴백 모델이 답했습니다.' }] } }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@gemini 안녕';
    d.querySelector('#sendBtn').click();
    await wait(1400);
    const seq = geminiCalls.map(c => (c.url.match(/models\/([^:]+)/) || [])[1]);
    ok('404: fallback order 3.5-flash-lite > 3.6-flash > 3.8-flash',
      seq.join(' > ') === 'gemini-3.5-flash-lite > gemini-3.6-flash > gemini-3.8-flash', seq.join(' > '));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('404: fallback reply posted', !!reply && reply.d.text.includes('폴백 모델') && reply.d.model === 'gemini-3.8-flash');
    const gen8 = geminiCalls[2].body.generationConfig || {};
    ok('3.8 요청에도 샘플링·thinkingConfig 없음',
      gen8.temperature === undefined && gen8.topP === undefined && gen8.thinkingConfig === undefined, JSON.stringify(gen8));
    dom.window.close();
  }

  /* ============ 4-B) 503(모델 과부하) 폴백 — 실제 사고 케이스 ============ */
  {
    const busy = () => ({ ok: false, status: 503, json: async () => ({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.' } }) });
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-flash-latest')) {
          return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '503 뚫고 마지막 모델이 답했습니다.' }] } }] }) };
        }
        return busy();
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 거푸집 해체 순서';
    d.querySelector('#sendBtn').click();
    await wait(2000);
    const seq = geminiCalls.map(c => (c.url.match(/models\/([^:]+)/) || [])[1]);
    ok('503: 모든 모델을 차례로 시도',
      seq.join(' > ') === 'gemini-3.5-flash-lite > gemini-3.6-flash > gemini-3.8-flash > gemini-2.5-flash > gemini-flash-latest', seq.join(' > '));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('503: 끝 모델 답장 게시', !!reply && reply.d.text.includes('503 뚫고') && reply.d.model === 'gemini-flash-latest',
      reply && reply.d.text);
    ok('503: 오류 무전 안 올라감', !published.some(p => p.t === 'msg' && p.d.from === 'gemini' && p.d.error === true));
    ok('503: busy 해제', w.eval('S.geminiBusy') === false);
    dom.window.close();
  }

  /* ============ 4-C) 429(한도)도 곧바로 포기하지 않고 다음 모델 시도 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-3.5-flash-lite')) {
          return { ok: false, status: 429, json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '다음 모델이 답했습니다.' }] } }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 한도 테스트';
    d.querySelector('#sendBtn').click();
    await wait(1000);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('429: 다음 모델로 넘어가 답장', geminiCalls.length === 2 && !!reply && reply.d.model === 'gemini-3.6-flash'
      && reply.d.text.includes('다음 모델이'), (reply && reply.d.model) || 'none');
    dom.window.close();
  }

  /* ============ 4-D) 모든 모델이 503 → 안내 한 번만, 멈추지 않음 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: () => ({ ok: false, status: 503, json: async () => ({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 다 막히면?';
    d.querySelector('#sendBtn').click();
    await wait(2000);
    const errs = published.filter(p => p.t === 'msg' && p.d.from === 'gemini');
    ok('all-503: 5모델 모두 시도', geminiCalls.length === 5, 'calls=' + geminiCalls.length);
    ok('all-503: 안내 무전 1건', errs.length === 1, 'msgs=' + errs.length);
    ok('all-503: 503·재시도 안내 문구', !!errs[0] && errs[0].d.error === true && /503/.test(errs[0].d.text) && /다시/.test(errs[0].d.text),
      errs[0] && errs[0].d.text);
    ok('all-503: 상태 복귀', w.eval("S.agents.gemini.status") === '대기중' && w.eval('S.geminiBusy') === false);
    dom.window.close();
  }

  /* ============ 4-E) 망 지연·연결 실패도 다음 모델로 계속 (+ 2.5 요청 파라미터) ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-2.5-flash')) {
          return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '망 지연 뚫고 답했습니다.' }] } }] }) };
        }
        throw Object.assign(new Error('network down'), { name: 'TypeError' });
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 망 테스트';
    d.querySelector('#sendBtn').click();
    await wait(1400);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('net-error: 다음 모델로 계속 시도', geminiCalls.length === 4, 'calls=' + geminiCalls.length);
    ok('net-error: 답장 게시', !!reply && reply.d.text.includes('망 지연 뚫고') && reply.d.model === 'gemini-2.5-flash', reply && reply.d.text);
    const gen25 = (geminiCalls[3] && geminiCalls[3].body.generationConfig) || {};
    ok('2.5 요청에는 thinkingBudget:0', !!(gen25.thinkingConfig && gen25.thinkingConfig.thinkingBudget === 0), JSON.stringify(gen25));
    ok('2.5 요청에는 temperature 유지', gen25.temperature === 0.85, JSON.stringify(gen25));
    dom.window.close();
  }

  /* ============ 4-F) 400 파라미터 거절도 다음 모델로 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-3.5-flash-lite')) {
          return { ok: false, status: 404, json: async () => ({ error: { code: 404, status: 'NOT_FOUND', message: 'model not found' } }) };
        }
        if (call.url.includes('gemini-3.6-flash')) {
          return { ok: false, status: 400, json: async () => ({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown name "thinkingConfig": Cannot find field.' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '파라미터 거절 뚫고 답했습니다.' }] } }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 파라미터 테스트';
    d.querySelector('#sendBtn').click();
    await wait(2000);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('400 파라미터: 다음 모델로 넘어가 답장', !!reply && reply.d.model === 'gemini-3.8-flash'
      && reply.d.text.includes('파라미터 거절'), (reply && reply.d.model) || 'none');
    dom.window.close();
  }

  /* ============ 4-G) 200인데 본문이 빈 응답(MAX_TOKENS)도 다음 모델로 ============ */
  {
    const { dom, w, d, published, geminiCalls } = boot({
      geminiResponder: (call) => {
        if (call.url.includes('gemini-3.5-flash-lite')) {
          return { ok: true, status: 200, json: async () => ({ candidates: [{ content: {}, finishReason: 'MAX_TOKENS' }], usageMetadata: { thoughtsTokenCount: 640 } }) };
        }
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '빈 응답 뚫고 답했습니다.' }] } }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', FAKE_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 빈 응답 테스트';
    d.querySelector('#sendBtn').click();
    await wait(1400);
    const seq = geminiCalls.map(c => (c.url.match(/models\/([^:]+)/) || [])[1]);
    ok('빈 응답: 다음 모델로 넘어감', seq.join(' > ') === 'gemini-3.5-flash-lite > gemini-3.6-flash', seq.join(' > '));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('빈 응답: 다음 모델 답장 게시', !!reply && reply.d.text.includes('빈 응답 뚫고') && reply.d.model === 'gemini-3.6-flash'
      && reply.d.error !== true, (reply && reply.d.text) || 'none');
    dom.window.close();
  }

  /* ============ 5) 키 오류 처리 ============ */
  {
    const { dom, w, d, published } = boot({
      geminiResponder: () => ({ ok: false, status: 400, json: async () => ({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_gemini_api_key', 'AIzaBADKEY0000');
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@제미나이 테스트';
    d.querySelector('#sendBtn').click();
    await wait(600);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'gemini').pop();
    ok('key error message posted', !!reply && /키/.test(reply.d.text) && reply.d.error === true);
    ok('agent back to 대기중', w.eval("S.agents.gemini.status") === '대기중');
    ok('key hint banner shown', !!d.querySelector('.aibanner'));
    ok('not stuck busy', w.eval('S.geminiBusy') === false);
    dom.window.close();
  }

  /* ============ 5-B) @그록 — 칩·키 없음 안내 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    const chips = [...d.querySelectorAll('[data-mention]')].map(b => b.dataset.mention);
    ok('groq: chip @그록', chips.includes('그록'), chips.join(','));
    ok('groq: 인력 시드(⚡ 초고속 AI 비서)', w.eval("S.agents.groq && S.agents.groq.emoji") === '⚡'
      && w.eval("S.agents.groq.role") === '초고속 AI 비서');
    d.querySelector('#msgInput').value = '@그록 3층 거푸집 해체 순서 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(500);
    ok('groq no-key: 내 무전은 올라감', published.some(p => p.t === 'msg' && String(p.d.text).includes('거푸집')));
    ok('groq no-key: Groq 호출 안 함', groqCalls.length === 0, 'calls=' + groqCalls.length);
    const banner = d.querySelector('.aibanner.groqbanner');
    ok('groq no-key: 안내 배너', !!banner && banner.textContent.includes('API 키'), banner && banner.textContent);
    ok('groq no-key: 배너에 키 넣기 버튼', !!d.querySelector('#groqKeyFromChat'));
    ok('groq no-key: 그록 답장 없음', !published.some(p => p.t === 'msg' && p.d.from === 'groq'));
    d.querySelector('#groqKeyFromChat').click();
    await wait(30);
    ok('groq no-key: 키 설정 시트', d.querySelector('#overlay').classList.contains('on')
      && d.querySelector('#sheet').textContent.includes('그록(Groq) API 키'));
    ok('groq no-key: 키 입력칸', !!d.querySelector('#gqInput'));
    dom.window.close();
  }

  /* ============ 5-C) 그록 키 저장 → OpenAI 호환 호출 → 답장 → 상태 복귀 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);

    d.querySelector('.tab[data-tab="crew"]').click();
    await wait(40);
    const keyBtn = d.querySelector('#groqKeyBtn');
    ok('groq crew: 키 설정 버튼', !!keyBtn && keyBtn.textContent.includes('그록(Groq) API 키 설정'));
    ok('groq crew: 그록 카드', d.querySelector('#view-crew').textContent.includes('그록 즉답'));
    ok('groq crew: 키 없음 표시', d.querySelector('#view-crew').textContent.includes('키 없음'));
    keyBtn.click();
    await wait(30);
    d.querySelector('#gqInput').value = FAKE_GROQ_KEY;
    d.querySelector('#gqSave').click();
    await wait(60);
    ok('groq key saved to localStorage(nogada_groq_key)', w.localStorage.getItem('nogada_groq_key') === FAKE_GROQ_KEY);
    ok('groq key masked in UI', d.querySelector('#view-crew').textContent.includes('키 등록됨'));
    ok('groq key NOT in any outgoing payload', !JSON.stringify(published).includes(FAKE_GROQ_KEY));

    /* 제미나이 키 시트: 예전 AIza…·새 AQ.… 둘 다 안내 */
    d.querySelector('#geminiKeyBtn').click();
    await wait(30);
    const gtxt = d.querySelector('#sheet').textContent;
    ok('gemini key sheet: AIza·AQ 두 형식 안내', gtxt.includes('AIza') && gtxt.includes('AQ.'), gtxt.slice(0, 120));
    d.querySelector('#overlay').click();
    await wait(30);

    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    w.eval(`S.messages['m-ctx-g1'] = {id:'m-ctx-g1', from:'roen', name:'로엔', emoji:'🦺', text:'자재 야적장 정리 끝냈습니다', ts: Date.now()-5000}; render();`);
    await wait(40);
    d.querySelector('#msgInput').value = '@그록 3층 거푸집 해체 순서 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(700);

    ok('groq called once', groqCalls.length === 1, 'calls=' + groqCalls.length);
    const call = groqCalls[0] || { url: '', headers: {}, body: {} };
    ok('groq: OpenAI 호환 endpoint', call.url === 'https://api.groq.com/openai/v1/chat/completions', call.url);
    ok('groq: Bearer 키 헤더', call.headers.Authorization === 'Bearer ' + FAKE_GROQ_KEY, JSON.stringify(call.headers));
    ok('groq: 첫 모델 openai/gpt-oss-120b', call.body.model === 'openai/gpt-oss-120b', call.body.model);
    ok('groq: stream false', call.body.stream === false);
    ok('groq: max_completion_tokens', typeof call.body.max_completion_tokens === 'number' && call.body.max_completion_tokens > 0);
    ok('groq: max_completion_tokens 4096 (긴 답이 잘리지 않게)', call.body.max_completion_tokens === 4096, String(call.body.max_completion_tokens));
    ok('groq: temperature', typeof call.body.temperature === 'number');
    ok('groq: gpt-oss reasoning_effort low', call.body.reasoning_effort === 'low', String(call.body.reasoning_effort));
    const sysMsg = (call.body.messages || [])[0] || {};
    const userMsg = (call.body.messages || [])[1] || {};
    ok('groq: system 메시지', sysMsg.role === 'system' && String(sysMsg.content).includes('AI 비서') && String(sysMsg.content).includes('그록'), String(sysMsg.content).slice(0, 60));
    ok('groq: 강제 현장 반장 말투 없음', !String(sysMsg.content).includes('현장 반장'));
    ok('groq: 존댓말 지시', String(sysMsg.content).includes('존댓말'));
    ok('groq: 최신정보는 확인 필요 지시', /확인 필요/.test(String(sysMsg.content)));
    ok('groq: user 메시지에 무전 맥락', userMsg.role === 'user'
      && String(userMsg.content).includes('자재 야적장 정리 끝냈습니다')
      && String(userMsg.content).includes('거푸집 해체 순서'));

    ok('groq: 상태 작업중 published', published.some(p => p.t === 'agent' && p.d.id === 'groq' && p.d.status === '작업중' && p.d.zone === 'work'));
    ok('groq: 상태 대기중 복귀', published.some(p => p.t === 'agent' && p.d.id === 'groq' && p.d.status === '대기중'));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq: 답장 그록 이름·이모지', !!reply && reply.d.name === '그록' && reply.d.emoji === '⚡');
    ok('groq: 답장에 model', !!reply && reply.d.model === 'openai/gpt-oss-120b', reply && reply.d.model);
    ok('groq: 답장 본문', !!reply && reply.d.text.includes('거푸집은 위에서부터') && reply.d.error !== true);
    ok('groq: 답장 화면 렌더', d.querySelector('#view-chat').textContent.includes('거푸집은 위에서부터'));
    ok('groq: typing indicator 없음', !d.querySelector('.msg.typing'));
    ok('groq: busy 해제', w.eval('S.groqBusy') === false);
    ok('groq: 키가 아웃바운드에 없음', !JSON.stringify(published).includes(FAKE_GROQ_KEY));
    dom.window.close();
  }

  /* ============ 5-D) 그록 모델 폴백: 429(한도) · 404(모델 없음) → 다음 모델 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot({
      groqResponder: (call) => {
        const model = call.body && call.body.model;
        if (model === 'openai/gpt-oss-120b') {
          return { ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit reached for model `openai/gpt-oss-120b`', type: 'tokens', code: 'rate_limit_exceeded' } }) };
        }
        if (model === 'qwen/qwen3.8-27b') {
          return { ok: false, status: 404, json: async () => ({ error: { message: 'The model `qwen/qwen3.8-27b` does not exist or you do not have access to it.', code: 'model_not_found' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '세 번째 모델이 답했습니다.' }, finish_reason: 'stop' }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 폴백 테스트';
    d.querySelector('#sendBtn').click();
    await wait(1500);
    const seq = groqCalls.map(c => c.body.model);
    ok('groq 429·404: 폴백 순서', seq.join(' > ') === 'openai/gpt-oss-120b > qwen/qwen3.8-27b > openai/gpt-oss-20b', seq.join(' > '));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq 429·404: 끝 모델 답장', !!reply && reply.d.text.includes('세 번째 모델') && reply.d.model === 'openai/gpt-oss-20b', (reply && reply.d.model) || 'none');
    ok('groq 429·404: 오류 무전 없음', !published.some(p => p.t === 'msg' && p.d.from === 'groq' && p.d.error === true));
    dom.window.close();
  }

  /* ============ 5-E) 그록 3모델 모두 503 → 안내 1건 + 상태 복귀 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot({
      groqResponder: () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'The model is currently overloaded, please try again later.' } }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 다 막히면?';
    d.querySelector('#sendBtn').click();
    await wait(1600);
    const errs = published.filter(p => p.t === 'msg' && p.d.from === 'groq');
    ok('groq all-503: 3모델 모두 시도', groqCalls.length === 3, 'calls=' + groqCalls.length);
    ok('groq all-503: 안내 무전 1건', errs.length === 1, 'msgs=' + errs.length);
    ok('groq all-503: 안내 문구', !!errs[0] && errs[0].d.error === true && /다시/.test(errs[0].d.text), errs[0] && errs[0].d.text);
    ok('groq all-503: 상태 복귀', w.eval("S.agents.groq.status") === '대기중' && w.eval('S.groqBusy') === false);
    dom.window.close();
  }

  /* ============ 5-F) 그록 키 오류(401) → 바로 안내 + 배너 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot({
      groqResponder: () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', 'gsk_BADKEY');
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 테스트';
    d.querySelector('#sendBtn').click();
    await wait(600);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq 401: 키 안내 무전', !!reply && /키/.test(reply.d.text) && reply.d.error === true, reply && reply.d.text);
    ok('groq 401: 다른 모델로 재시도 안 함(1회)', groqCalls.length === 1, 'calls=' + groqCalls.length);
    ok('groq 401: 배너 표시', !!d.querySelector('.aibanner.groqbanner'));
    ok('groq 401: 상태 복귀·busy 해제', w.eval("S.agents.groq.status") === '대기중' && w.eval('S.groqBusy') === false);
    dom.window.close();
  }

  /* ============ 5-G) 그록 본문이 빈 응답 → 다음 모델 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot({
      groqResponder: (call) => {
        if (call.body.model === 'openai/gpt-oss-120b') {
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '', reasoning: '생각만 하다 끝남' }, finish_reason: 'length' }] }) };
        }
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '빈 응답 뚫고 답했습니다.' }, finish_reason: 'stop' }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 빈 응답 테스트';
    d.querySelector('#sendBtn').click();
    await wait(1000);
    const seq = groqCalls.map(c => c.body.model);
    ok('groq 빈 응답: 다음 모델로', seq.join(' > ') === 'openai/gpt-oss-120b > qwen/qwen3.8-27b', seq.join(' > '));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq 빈 응답: 다음 모델 답장', !!reply && reply.d.text.includes('빈 응답 뚫고') && reply.d.model === 'qwen/qwen3.8-27b' && reply.d.error !== true);
    dom.window.close();
  }

  /* ============ 5-H) 그록 400 reasoning 파라미터 거절 → 같은 모델을 순수 본문으로 재시도 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot({
      groqResponder: (call) => {
        if (call.body.reasoning_effort) {
          return { ok: false, status: 400, json: async () => ({ error: { message: 'reasoning_effort is not supported for this model', type: 'invalid_request_error' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '파라미터 거절 뚫고 답했습니다.' }, finish_reason: 'stop' }] }) };
      }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 파라미터 테스트';
    d.querySelector('#sendBtn').click();
    await wait(900);
    ok('groq 400 파라미터: 같은 모델 2회', groqCalls.length === 2
      && groqCalls[0].body.model === 'openai/gpt-oss-120b' && groqCalls[1].body.model === 'openai/gpt-oss-120b',
      groqCalls.map(c => c.body.model).join(' > '));
    ok('groq 400 파라미터: 첫 요청엔 reasoning_effort', !!groqCalls[0] && groqCalls[0].body.reasoning_effort === 'low');
    ok('groq 400 파라미터: 재시도엔 reasoning_effort 없음', !!groqCalls[1] && groqCalls[1].body.reasoning_effort === undefined);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq 400 파라미터: 답장 게시', !!reply && reply.d.text.includes('파라미터 거절') && reply.d.error !== true, reply && reply.d.text);
    dom.window.close();
  }

  /* ============ 5-I) @groq 영문 멘션도 그록 즉답 ============ */
  {
    const { dom, w, d, published, groqCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@groq 안녕';
    d.querySelector('#sendBtn').click();
    await wait(700);
    ok('groq 영문 멘션: 호출됨', groqCalls.length === 1, 'calls=' + groqCalls.length);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('groq 영문 멘션: 답장', !!reply && reply.d.name === '그록', (reply && reply.d.name) || 'none');
    dom.window.close();
  }

  /* ============ 5-J) Tavily 검색 키 UI · localStorage 저장 · 마스킹 · 유출 금지 ============ */
  {
    const { dom, w, d, published } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    d.querySelector('.tab[data-tab="crew"]').click();
    await wait(40);
    const crew = d.querySelector('#view-crew').textContent;
    ok('tavily crew: 카드', crew.includes('Tavily 실시간 검색'));
    ok('tavily crew: 미설정 · 월 1,000건 무료', crew.includes('미설정 · 월 1,000건 무료'));
    const btn = d.querySelector('#tavilyKeyBtn');
    ok('tavily crew: 🔍 Tavily 검색 API 키 설정 버튼', !!btn && btn.textContent.includes('🔍 Tavily 검색 API 키 설정'), btn && btn.textContent);
    btn.click();
    await wait(30);
    const sheet = d.querySelector('#sheet').textContent;
    ok('tavily sheet: 열림', d.querySelector('#overlay').classList.contains('on') && sheet.includes('Tavily 검색 API 키'));
    ok('tavily sheet: tvly- 키 안내', sheet.includes('tvly-'));
    ok('tavily sheet: app.tavily.com/home 링크', !!d.querySelector('#sheet a[href="https://app.tavily.com/home"]'));
    ok('tavily sheet: 월 1,000건 무료 안내', sheet.includes('월 1,000건'));
    ok('tavily sheet: 저장·테스트 버튼', !!d.querySelector('#tvSave') && !!d.querySelector('#tvTest'));
    ok('tavily sheet: 키 없을 땐 삭제 버튼 없음', !d.querySelector('#tvDel'));

    d.querySelector('#tvInput').value = FAKE_TAVILY_KEY;
    d.querySelector('#tvSave').click();
    await wait(70);
    ok('tavily key saved to localStorage(nogada_tavily_key)', w.localStorage.getItem('nogada_tavily_key') === FAKE_TAVILY_KEY,
      String(w.localStorage.getItem('nogada_tavily_key')));
    const crew2 = d.querySelector('#view-crew').textContent;
    ok('tavily crew: 웹 검색 연결됨', crew2.includes('웹 검색 연결됨'));
    ok('tavily key masked in UI', crew2.includes('tvly-T…7890'), crew2.slice(0, 40));
    ok('tavily key NOT in any outgoing payload', !JSON.stringify(published).includes(FAKE_TAVILY_KEY));
    ok('tavily key NOT in page source(HTML)', !HTML.includes(FAKE_TAVILY_KEY));

    d.querySelector('#tavilyKeyBtn').click();
    await wait(30);
    ok('tavily sheet: 키 있을 때 삭제 버튼', !!d.querySelector('#tvDel'));
    d.querySelector('#tvDel').click();
    await wait(70);
    ok('tavily key cleared', !w.localStorage.getItem('nogada_tavily_key'));
    ok('tavily crew: 미설정으로 복귀', d.querySelector('#view-crew').textContent.includes('미설정'));
    dom.window.close();
  }

  /* ============ 5-K) 검색 → 프롬프트 주입 → 🔎 출처 표기 ============ */
  {
    const { dom, w, d, published, groqCalls, tavilyCalls } = boot({
      tavilyResponder: () => ({ ok: true, status: 200, json: async () => ({
        query: '오늘 서울 날씨 어때?',
        answer: '오늘 서울은 맑고 낮 최고 13도입니다.',
        results: [
          { title: '기상청 날씨누리', url: 'https://www.weather.go.kr/main', content: '서울 낮 최고 13도, 밤 최저 2도.' },
          { title: '연합뉴스', url: 'https://www.yna.co.kr/view/1', content: '수도권 맑음, 미세먼지 보통.' },
          { title: '세 번째 출처', url: 'https://example.com/3', content: '세 번째 결과' },
          { title: '네 번째 출처', url: 'https://example.com/4', content: '네 번째 결과' },
          { title: '다섯 번째 출처', url: 'https://example.com/5', content: '다섯 번째 결과' }
        ]
      }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 서울 날씨 어때?';
    d.querySelector('#sendBtn').click();
    await wait(900);

    ok('tavily: 검색 1회 호출', tavilyCalls.length === 1, 'calls=' + tavilyCalls.length);
    const tc = tavilyCalls[0] || { url: '', headers: {}, body: {} };
    ok('tavily: endpoint', tc.url === 'https://api.tavily.com/search', tc.url);
    ok('tavily: Bearer 키 헤더', tc.headers.Authorization === 'Bearer ' + FAKE_TAVILY_KEY);
    ok('tavily: query는 멘션 제거한 질문', tc.body.query === '오늘 서울 날씨 어때?', tc.body.query);
    ok('tavily: search_depth basic', tc.body.search_depth === 'basic');
    ok('tavily: max_results 4', tc.body.max_results === 4, String(tc.body.max_results));
    ok('tavily: include_answer true', tc.body.include_answer === true);
    ok('tavily: api_key 본문 포함', tc.body.api_key === FAKE_TAVILY_KEY);

    const call = groqCalls[0] || { body: { messages: [] } };
    const sys = String((call.body.messages || [])[0].content || '');
    const user = String((call.body.messages || [])[1].content || '');
    ok('groq: max_completion_tokens 4096', call.body.max_completion_tokens === 4096, String(call.body.max_completion_tokens));
    ok('persona(검색): 실시간 검색 결과를 근거로 쓰라는 지시', sys.includes('실시간 웹 검색 결과') && sys.includes('Tavily'));
    ok('persona(검색): 🔎 출처 형식 지시', sys.includes('🔎 출처: 제목1 · 제목2'));
    ok('persona(검색): 확인 필요 지시 유지', sys.includes('확인 필요'));
    ok('prompt: [지금 시각] KST 포함', /\[지금 시각\][\s\S]*KST/.test(user), user.slice(0, 80));
    ok('prompt: 오늘 날짜(YYYY-MM-DD) 포함', /\d{4}-\d{2}-\d{2} \([일월화수목금토]\) \d{2}:\d{2} KST/.test(user));
    ok('prompt: 검색 요약 주입', user.includes('낮 최고 13도'));
    ok('prompt: 상위 결과 제목·URL 주입', user.includes('기상청 날씨누리') && user.includes('https://www.weather.go.kr/main'));
    ok('prompt: max_results(4) 초과 결과는 주입 안 함', !user.includes('다섯 번째 출처'));

    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('답장 게시', !!reply && reply.d.error !== true);
    ok('답장: 🔎 출처 제목 2개', !!reply && reply.d.text.includes('🔎 출처: 기상청 날씨누리 · 연합뉴스'), reply && reply.d.text);
    ok('답장: 본문 유지', !!reply && reply.d.text.includes('거푸집은 위에서부터'));
    ok('답장: live 표시', !!reply && reply.d.live === true);
    ok('tavily 키가 아웃바운드에 없음', !JSON.stringify(published).includes(FAKE_TAVILY_KEY));
    ok('groq 키가 아웃바운드에 없음', !JSON.stringify(published).includes(FAKE_GROQ_KEY));
    ok('상태 복귀', w.eval('S.groqBusy') === false);
    dom.window.close();
  }

  /* ============ 5-K-2) 그록이 이미 출처를 붙였으면 중복하지 않음 ============ */
  {
    const { dom, w, d, published } = boot({
      groqResponder: () => ({ ok: true, status: 200, json: async () => ({
        choices: [{ message: { role: 'assistant', content: '서울은 맑고 13도입니다.\n🔎 출처: 기상청' }, finish_reason: 'stop' }] }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 날씨';
    d.querySelector('#sendBtn').click();
    await wait(800);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    const cnt = reply ? (reply.d.text.match(/🔎 출처/g) || []).length : -1;
    ok('출처 중복 없음(1회)', cnt === 1, 'count=' + cnt);
    dom.window.close();
  }

  /* ============ 5-L) 인사·잡담에는 검색 생략(쿼터 절약) ============ */
  {
    const { dom, w, d, published, groqCalls, tavilyCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    const ask = async (text) => {
      d.querySelector('#msgInput').value = text;
      d.querySelector('#sendBtn').click();
      await wait(500);
    };
    await ask('@그록 안녕');
    ok('잡담(안녕): Tavily 호출 안 함', tavilyCalls.length === 0, 'calls=' + tavilyCalls.length);
    ok('잡담(안녕): 그록 답장', groqCalls.length === 1 && published.some(p => p.t === 'msg' && p.d.from === 'groq'));
    const sys1 = String(groqCalls[0].body.messages[0].content || '');
    ok('잡담: 검색 실패 안내 페르소나 아님', !sys1.includes('결과를 받지 못했다'));
    ok('잡담: Tavily 키 없음 안내도 아님', !sys1.includes('키가 아직 없다'));

    await ask('@그록 고마워');
    ok('잡담(고마워): Tavily 호출 안 함', tavilyCalls.length === 0, 'calls=' + tavilyCalls.length);
    await ask('@groq 테스트');
    ok('잡담(테스트): Tavily 호출 안 함', tavilyCalls.length === 0, 'calls=' + tavilyCalls.length);

    await ask('@그록 오늘 서울 날씨');
    ok('질문: Tavily 호출함', tavilyCalls.length === 1, 'calls=' + tavilyCalls.length);
    dom.window.close();
  }

  /* ============ 5-M) Tavily 실패(401·429·시간초과·망) → 검색 없이 그록이 답한다 ============ */
  {
    const keyErr = () => ({ ok: false, status: 401, json: async () => ({ detail: { error: 'Unauthorized: missing or invalid API key.' } }) });
    const { dom, w, d, published, groqCalls, tavilyCalls } = boot({ tavilyResponder: keyErr });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', 'tvly-BADKEY');
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 서울 날씨';
    d.querySelector('#sendBtn').click();
    await wait(800);
    ok('tavily 401: 검색은 시도', tavilyCalls.length === 1);
    ok('tavily 401: 그록은 정상 호출', groqCalls.length === 1, 'calls=' + groqCalls.length);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('tavily 401: 답장 게시(오류 무전 아님)', !!reply && reply.d.error !== true && reply.d.text.includes('거푸집은'), reply && reply.d.text);
    ok('tavily 401: 출처 없음', !!reply && !reply.d.text.includes('🔎 출처'));
    ok('tavily 401: searchFailed 표시', !!reply && reply.d.searchFailed === true);
    const sys = String(groqCalls[0].body.messages[0].content || '');
    ok('tavily 401: 검색 실패 페르소나', sys.includes('결과를 받지 못했다'));
    ok('tavily 401: 상태 복귀', w.eval('S.groqBusy') === false && w.eval("S.agents.groq.status") === '대기중');
    ok('tavily 401: 키 유출 없음', !JSON.stringify(published).includes('tvly-BADKEY'));
    dom.window.close();
  }
  {
    const { dom, w, d, published, groqCalls } = boot({
      tavilyResponder: () => ({ ok: false, status: 429, json: async () => ({ detail: { error: 'Rate limit exceeded' } }) })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 환율 알려줘';
    d.querySelector('#sendBtn').click();
    await wait(800);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('tavily 429: 그록이 계속 답함', groqCalls.length === 1 && !!reply && reply.d.error !== true);
    ok('tavily 429: searchFailed 표시', !!reply && reply.d.searchFailed === true);
    dom.window.close();
  }
  {
    const { dom, w, d, published, groqCalls, tavilyCalls } = boot({
      tavilyResponder: (call) => new Promise((resolve, reject) => {   /* 응답 없음 → 타임아웃 abort 경로 */
        const sig = call.signal;
        if (!sig) return;
        if (typeof sig.addEventListener === 'function') sig.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        else sig.onabort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      })
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    w.eval('S.tavilyTimeoutMs = 120');
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 서울 날씨';
    d.querySelector('#sendBtn').click();
    await wait(1000);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('tavily 지연: 검색은 시도', tavilyCalls.length === 1);
    ok('tavily 지연: 그록 답장은 나감', groqCalls.length === 1 && !!reply && reply.d.error !== true, reply && reply.d.text);
    ok('tavily 지연: searchFailed·출처 없음', !!reply && reply.d.searchFailed === true && !reply.d.text.includes('🔎 출처'));
    ok('tavily 지연: busy 해제', w.eval('S.groqBusy') === false);
    dom.window.close();
  }
  {
    const { dom, w, d, published, groqCalls } = boot({
      tavilyResponder: () => { throw Object.assign(new Error('network down'), { name: 'TypeError' }); }
    });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    w.localStorage.setItem('nogada_tavily_key', FAKE_TAVILY_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 뉴스';
    d.querySelector('#sendBtn').click();
    await wait(800);
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('tavily 망오류: 그록 계속 답함', groqCalls.length === 1 && !!reply && reply.d.error !== true);
    ok('tavily 망오류: 상태 복귀', w.eval('S.groqBusy') === false);
    dom.window.close();
  }

  /* ============ 5-N) Tavily 키 없으면 검색 안 붙고 '키 넣으면' 안내 페르소나 ============ */
  {
    const { dom, w, d, published, groqCalls, tavilyCalls } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    w.localStorage.setItem('nogada_groq_key', FAKE_GROQ_KEY);
    d.querySelector('.tab[data-tab="chat"]').click();
    await wait(30);
    d.querySelector('#msgInput').value = '@그록 오늘 서울 날씨';
    d.querySelector('#sendBtn').click();
    await wait(700);
    ok('tavily 없음: 검색 호출 0', tavilyCalls.length === 0);
    const sys = String(groqCalls[0].body.messages[0].content || '');
    const user = String(groqCalls[0].body.messages[1].content || '');
    ok('tavily 없음: 확인 필요 지시', sys.includes('확인 필요'));
    ok('tavily 없음: Tavily 키 안내 지시', sys.includes('Tavily') && sys.includes('키가 아직 없다'));
    ok('tavily 없음: 프롬프트에 검색 블록 없음', !user.includes('[실시간 웹 검색 결과'));
    ok('tavily 없음: 지금 시각은 여전히 주입', /\[지금 시각\][\s\S]*KST/.test(user));
    const reply = published.filter(p => p.t === 'msg' && p.d.from === 'groq').pop();
    ok('tavily 없음: 답장 정상·출처 없음', !!reply && reply.d.error !== true && !reply.d.text.includes('🔎 출처'));
    dom.window.close();
  }

  /* ============ 6) @Cue 문구 복사 (Firebase RTDB 모드 · 로그인 없이 auth=off) ============ */
  {
    const { dom, d, copied } = boot({ url: 'https://example.test/?room=nogada01&auth=off' });
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    d.querySelector('.tab[data-tab="crew"]').click();
    await wait(40);
    ok('cue card present', d.querySelector('#view-crew').textContent.includes('Cue한테 시킬 문구'));
    ok('cue agent in crew', d.querySelector('#view-crew').textContent.includes('외부 첩보반장'));
    d.querySelector('#cueCopyBtn').click();
    await wait(60);
    const text = copied[0] || '';
    ok('cue prompt copied', text.length > 100, 'len=' + text.length);
    ok('cue prompt: GET messages url', text.includes('GET ' + FB + '/rooms/nogada01/messages.json'));
    ok('cue prompt: POST messages url', text.includes('POST ' + FB + '/rooms/nogada01/messages.json'));
    ok('cue prompt: from cue', text.includes('"from":"cue"'));
    ok('cue prompt: name Cue', text.includes('"name":"Cue"'));
    ok('cue prompt: emoji 🕶️', text.includes('"emoji":"🕶️"'));
    ok('cue prompt: @Cue mention rule', text.includes('@Cue'));
    dom.window.close();
  }

  /* ============ 6b) Google 로그인 게이트 (RTDB 모드) ============ */
  {
    const fb = fakeFirebase();
    const { dom, d, fbCalls, copied } = boot({ url: 'https://example.test/?room=nogada01', firebase: fb });
    await wait(120);
    ok('auth: 로그인 전 게이트 표시', !d.querySelector('#authGate').hidden);
    ok('auth: Google 로그인 버튼', !!d.querySelector('#agSignIn'));
    ok('auth: 로그인 전 RTDB 호출 0', fbCalls.length === 0, 'calls=' + fbCalls.length);
    ok('auth: 헤더에 로그인 필요', d.querySelector('#authWho').textContent.includes('로그인 필요'));
    ok('auth: 승인된 도메인 안내 없음(정상 상태)', !d.querySelector('#authGateCard').textContent.includes('승인된 도메인에 없습니다'));

    await fb.signIn('jpak0813@gmail.com');
    await wait(160);
    ok('auth: 로그인 후 게이트 사라짐', d.querySelector('#authGate').hidden);
    ok('auth: RTDB 호출에 auth 토큰', fbCalls.some(c => c.url.includes('auth=test-id-token')));
    ok('auth: 헤더에 계정 표시', d.querySelector('#authWho').textContent.includes('jpak0813@gmail.com'));
    ok('auth: 로그인 후 출입증 시트', d.querySelector('#overlay').classList.contains('on'));

    d.querySelector('[data-me="jingyu"]').click();
    await wait(30);
    d.querySelector('.tab[data-tab="crew"]').click();
    await wait(60);
    ok('auth: 인력 현황에 계정 카드', d.querySelector('#view-crew').textContent.includes('현장주 계정'));
    ok('auth: 로그아웃 버튼', !!d.querySelector('#authOutBtn'));
    ok('auth: 현장주에게만 허용 이메일 추가칸', !!d.querySelector('#allowEmail'));

    d.querySelector('#cueCopyBtn').click();
    await wait(60);
    ok('auth: Cue 문구에 로그인 토큰 포함', String(copied[0] || '').includes('auth=test-id-token'));
    ok('auth: Cue 문구에 토큰 만료 안내', String(copied[0] || '').includes('401'));

    d.querySelector('#authOutBtn').click();
    await wait(100);
    ok('auth: 로그아웃 후 다시 게이트', !d.querySelector('#authGate').hidden);
    ok('auth: 로그아웃 후 RTDB 재호출 없음', fbCalls.filter(c => c.url.includes('auth=')).length > 0);
    dom.window.close();
  }

  /* ============ 6c) 권한 없는 계정 → 401 → 안내 ============ */
  {
    const fb = fakeFirebase();
    const denied = () => ({ ok: false, status: 401, json: async () => ({ error: 'Permission denied' }), text: async () => '' });
    const { dom, d } = boot({ url: 'https://example.test/?room=nogada01', firebase: fb, fbResponder: denied });
    await wait(80);
    await fb.signIn('stranger@gmail.com');
    await wait(200);
    ok('auth: 권한 없는 계정 → 게이트 유지', !d.querySelector('#authGate').hidden);
    ok('auth: 거부 사유·계정 표시', d.querySelector('#authGateCard').textContent.includes('권한이 없는 계정')
      && d.querySelector('#authGateCard').textContent.includes('stranger@gmail.com'));
    ok('auth: 다른 계정 로그인 버튼', !!d.querySelector('#agSwitch'));
    dom.window.close();
  }

  /* ============ 7) 모바일 레이아웃(앱 셸) — CSS 계약 ============ */
  {
    const css = (HTML.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
    ok('layout: body가 화면 높이(100dvh) 앱 셸',
      /body\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*height:100dvh/s.test(css));
    ok('layout: main이 남는 높이를 차지하고 그 안에서 스크롤',
      /main\s*\{[^}]*flex:1 1 auto[^}]*min-height:0[^}]*overflow-y:auto/s.test(css));
    ok('layout: 무전기 탭이 세로 flex로 끝까지 늘어남',
      /#view-chat\.on\s*\{[^}]*flex:1 1 auto[^}]*min-height:0/s.test(css));
    ok('layout: 무전 카드가 flex 컬럼', /\.[\w.]*chatcard[^{]*\{[^}]*display:flex[^}]*flex-direction:column/s.test(css));
    ok('layout: 무전 목록이 남는 높이를 전부 사용(고정 max-height 없음)',
      /\.chat-scroll\s*\{[^}]*flex:1 1 auto/s.test(css) && !/\.chat-scroll\s*\{[^}]*max-height:min\(52vh/s.test(css));
    ok('layout: 하단 탭바는 본문 흐름의 마지막(fixed 아님) + 안전영역',
      /nav\.tabs\s*\{[^}]*position:relative/s.test(css) && /nav\.tabs\s*\{[^}]*var\(--safe-b\)/s.test(css));
    ok('layout: 현장맵 탭이 세로 flex로 남는 높이를 채움',
      /#view-map\.on\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*flex:1 1 auto/s.test(css));
    ok('layout: 맵 그림이 4:3 + 어두운 배경(흰 여백 없음)',
      /\.mapwrap\s*\{[^}]*aspect-ratio:4\/3/s.test(css) && /\.mapwrap\s*\{[^}]*background:#0b0e13/s.test(css)
      && !/\.mapwrap\s*\{[^}]*background:#e9e2d4/s.test(css));
    ok('layout: 지금 오피스 상태판이 남는 높이를 채움',
      /\.nowcard\s*\{[^}]*flex:1 1 auto/s.test(css) && /\.nowlist\s*\{[^}]*flex:1 1 auto/s.test(css));
    ok('anim: 캐릭터가 left/top 0.8초 transition으로 미끄러짐',
      /\.actor\s*\{[^}]*transition:left \.8s[^}]*top \.8s/s.test(css));
    ok('anim: 숨쉬기(breathe)·작업 바운스(workBob)·합류 펄스(joinPulse) 키프레임',
      /@keyframes breathe/.test(css) && /@keyframes workBob/.test(css) && /@keyframes joinPulse/.test(css));
    ok('anim: prefers-reduced-motion이면 애니메이션 끔', /prefers-reduced-motion:reduce/.test(css));
  }

  /* ============ 8) 스마트 오피스 맵 — 움직이는 캐릭터 ============ */
  {
    const { dom, w, d } = boot();
    await wait(160);
    d.querySelector('[data-me="jingyu"]').click();
    await wait(60);

    const actors = [...d.querySelectorAll('.actor')];
    ok('map: 캐릭터 5명이 지도 위에 렌더', actors.length === 5, String(actors.length));
    ok('map: 캐릭터마다 data-agent·data-state·좌표',
      actors.every(a => a.dataset.agent && a.dataset.state && a.style.left && a.style.top));

    const roen = d.querySelector('.actor[data-agent="roen"]');
    ok('map: 로엔(대기중) → idle', roen.classList.contains('idle') && roen.dataset.state === 'idle', roen.className);
    ok('map: idle 캐릭터는 라운지 쪽(x>50%)에 있음',
      parseFloat(roen.style.left) > 50 && parseFloat(roen.style.top) > 45, roen.style.left + ' / ' + roen.style.top);
    ok('map: idle 캐릭터 배지 ☕/💤', ['☕','💤'].includes(roen.querySelector('.bd').textContent));

    const binna = d.querySelector('.actor[data-agent="binna"]');
    ok('map: 박빈나(합류대기) → joining 펄스', binna.classList.contains('joining') && binna.dataset.state === 'joining', binna.className);

    w.eval("S.agents.roen.status='작업중'; S.agents.roen.zone='work'; render();");
    await wait(60);
    const roenWork = d.querySelector('.actor[data-agent="roen"]');
    ok('map: 작업중으로 바뀌면 working 클래스', roenWork.classList.contains('working'), roenWork.className);
    ok('map: 작업중 배지 ⚡', roenWork.querySelector('.bd').textContent === '⚡');
    ok('map: 작업중이면 리서치 존 책상 자리(x 55~85%)로 이동',
      parseFloat(roenWork.style.left) >= 55 && parseFloat(roenWork.style.left) <= 85, roenWork.style.left);
    ok('map: 작업중 구역 이름표가 busy', d.querySelector('.zone[data-zone="work"]').classList.contains('busy'));

    w.eval("S.agents.roen.status='대기중'; render();");
    await wait(60);
    const roenBack = d.querySelector('.actor[data-agent="roen"]');
    ok('map: 다시 대기중이면 라운지로 복귀', roenBack.classList.contains('idle') && parseFloat(roenBack.style.left) > 50, roenBack.style.left);

    w.eval("S.agents.cue.status='식사중'; render();");
    await wait(60);
    const cueEat = d.querySelector('.actor[data-agent="cue"]');
    ok('map: 식사중 → eating + 🍽️', cueEat.classList.contains('eating') && cueEat.querySelector('.bd').textContent === '🍽️', cueEat.className);

    d.querySelector('.actor[data-agent="cue"]').click();
    await wait(40);
    const toastEl = d.querySelector('#toast');
    ok('map: 캐릭터를 누르면 상태 토스트',
      toastEl.classList.contains('on') && toastEl.textContent.includes('Cue') && toastEl.textContent.includes('식사중'), toastEl.textContent);
    ok('map: 누른 캐릭터가 잠깐 강조(sel)', d.querySelector('.actor[data-agent="cue"]').classList.contains('sel'));

    const zkeys = w.eval('Object.keys(ZONES).join(",")');
    ok('map: 구역 내부 키는 그대로(office/work/yard/break)', zkeys === 'office,work,yard,break', zkeys);
    const mapText = d.querySelector('#view-map').textContent;
    ok('map: 이름표가 스마트 오피스 4구역',
      ['지휘실','리서치 존','자료·아카이브','오피스 라운지'].every(s => mapText.includes(s)));
    ok('map: 지금 오피스 상태판', mapText.includes('지금 오피스') && d.querySelector('.nowcard .nowlist'));

    d.querySelector('.zone[data-zone="work"]').click();
    await wait(40);
    ok('map: 구역을 누르면 기존 구역 시트가 열림',
      d.querySelector('#overlay').classList.contains('on') && d.querySelector('#sheet').textContent.includes('리서치 존'));
    dom.window.close();
  }

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log('\nSUMMARY: ' + (results.length - failed) + ' passed / ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
