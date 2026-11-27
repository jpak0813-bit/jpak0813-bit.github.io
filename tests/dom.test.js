/* 노가다 현장 합동 비서실 — DOM/유닛 테스트
 * 실행: npm i (tests 폴더) 후  node tests/dom.test.js
 *   jsdom으로 index.html을 실제로 띄우고, 네트워크(ntfy/Firebase/Gemini)는 가짜로 바꿔서 검사합니다.
 *   - 기본 앱 동작(맵·무전기·작업일지·인력현황)
 *   - @제미나이 즉답: 키 없음 안내 / 키 저장(localStorage) / 정상 호출 / 모델 폴백(404·503·429·망 지연) / 키 오류
 *   - 키가 소스·Firebase 페이로드에 절대 섞이지 않는지
 *   - @Cue 인력·칩·"Cue한테 시킬 문구 복사"
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FAKE_KEY = 'AIzaSyTESTKEY_do_not_leak_1234567890';
const FB = 'https://pickle-nogada-office-default-rtdb.asia-southeast1.firebasedatabase.app';

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => results.push((cond ? 'PASS' : 'FAIL') + ' · ' + name + (extra ? ' — ' + extra : ''));

function boot(opts = {}) {
  const published = [];       // 앱이 밖으로 내보낸 모든 페이로드(ntfy/Firebase)
  const geminiCalls = [];     // Gemini API 호출 기록
  const copied = [];
  const geminiResponder = opts.geminiResponder || (() => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '거푸집은 위에서부터 한 단씩 내려오면 됩니다. 안전대 먼저 겁니다.' }] } }] })
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
        if (u.includes('ntfy.sh') && u.includes('/json?poll=1')) return { ok: true, text: async () => '' };
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
      window.requestAnimationFrame = cb => setTimeout(() => cb(0), 0);
      window.scrollTo = () => {};
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async t => { copied.push(t); } }
      });
    }
  });
  return { dom, w: dom.window, d: dom.window.document, published, geminiCalls, copied };
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

  /* ============ 6) @Cue 문구 복사 (Firebase RTDB 모드 = 기본값) ============ */
  {
    const { dom, d, copied } = boot({ url: 'https://example.test/?room=nogada01' });
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
  }

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log('\nSUMMARY: ' + (results.length - failed) + ' passed / ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
