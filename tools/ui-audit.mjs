#!/usr/bin/env node
/**
 * 모바일/데스크톱 UI 감사 도구.
 *
 *   node tools/ui-audit.mjs                 # 전체 프로필 × 전체 상태
 *   node tools/ui-audit.mjs --profile ip14-land --state S6
 *   node tools/ui-audit.mjs --label before  # 스크린샷을 /tmp/ui-shots/before/ 아래에 저장
 *
 * 세 가지를 자동으로 검사한다.
 *   1) 겹침   - 주요 UI 요소들의 경계상자가 서로 겹치거나 화면 밖으로 나가는지
 *   2) 터치   - elementFromPoint로 실효 히트영역을 재서 44px 미만인 버튼 찾기
 *   3) 폰트   - 화면에 보이는 글자 중 하한보다 작은 것 찾기 (SVG는 화면 px로 환산)
 *
 * 주의: 게임의 모바일 판정이 UA 기반이라(fitMapToViewport) 반드시 devices[] 디스크립터로
 * 컨텍스트를 만들어야 한다. viewport만 지정하면 mobile-landscape가 절대 켜지지 않는다.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = 8765;
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SHOT_DIR = '/tmp/ui-shots';

// ---------------------------------------------------------------- 기준값
// 폰트 하한은 기기별로 다르다. 데스크톱은 .pad-legend(8.5px) 같은 보조 문구가
// 정상이라, 모바일 하한 10을 그대로 들이대면 매번 오탐이 수십 건 쏟아져
// 리포트를 안 읽게 된다.
const FONT_MIN_MOBILE = 10;
const FONT_MIN_DESKTOP = 8;
const TOUCH_MIN = 44;     // 터치 타깃 권장 최소(px)
const OVERLAP_MAX = 4;    // 이 면적(px^2)을 넘게 겹치면 실패

// 터치 크기를 재지 않을 예외. 의도적으로 작게 두는 것들만 사유와 함께 적는다.
const TOUCH_WHITELIST = new Set([
  '.ov-head',   // 패널 헤더(드래그·접기용). 44px로 키우면 가로모드 세로예산을 크게 먹는다
]);

// ---------------------------------------------------------------- 프로필
const MOBILE_UA = devices['iPhone 13'].userAgent;
const ANDROID_UA = devices['Pixel 7'].userAgent;

const PROFILES = [
  { name: 'se-land',     w: 667,  h: 375, mobile: true,  ua: MOBILE_UA,  note: '최소 폭' },
  { name: 's8-land',     w: 740,  h: 360, mobile: true,  ua: ANDROID_UA, note: '최소 높이 - 가장 빡빡' },
  { name: 'ip14-land',   w: 844,  h: 390, mobile: true,  ua: MOBILE_UA,  note: '주력' },
  { name: 'pixel7-land', w: 915,  h: 412, mobile: true,  ua: ANDROID_UA, note: 'Android/TWA 대표' },
  { name: 'ip15pm-land', w: 932,  h: 430, mobile: true,  ua: MOBILE_UA,  note: '최대' },
  { name: 'edge-land',   w: 1000, h: 520, mobile: true,  ua: MOBILE_UA,  note: '판정 경계' },
  { name: 'portrait',    w: 390,  h: 844, mobile: true,  ua: MOBILE_UA,  note: '세로 - 회전안내만' },
  { name: 'desktop-hd',  w: 1440, h: 900, mobile: false, ua: null,       note: '데스크톱 회귀' },
  { name: 'desktop-sm',  w: 1180, h: 700, mobile: false, ua: null,       note: '데스크톱 좁은 창' },
  { name: 'desktop-xs',  w: 900,  h: 700, mobile: false, ua: null,       note: '760px 쿼리 경계' },
];

// ---------------------------------------------------------------- 상태
// 게임 함수가 전부 전역이라 evaluate로 상태를 직접 만들 수 있다.
const STATES = [
  { id: 'S1', desc: '시작화면', setup: async () => {} },
  { id: 'S2', desc: '시작화면(이름 입력)', setup: async (p) => {
      await p.fill('#operatorNameInput', '임승진').catch(()=>{});
  }},
  { id: 'S3a', desc: '튜토리얼 1장', setup: async (p) => { await startGame(p); await openTutorial(p, 0); } },
  { id: 'S3d', desc: '튜토리얼 4장', setup: async (p) => { await startGame(p); await openTutorial(p, 3); } },
  { id: 'S3h', desc: '튜토리얼 8장', setup: async (p) => { await startGame(p); await openTutorial(p, 7); } },
  { id: 'S4', desc: '게임대기(미션 없음)', setup: async (p) => { await startGame(p); } },
  { id: 'S5', desc: '미션 진행중', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => { try{ startMission(); }catch(e){} });
      await p.waitForTimeout(300);
  }},
  { id: 'S6', desc: '미션 + 화차선택', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => { try{ startMission(); }catch(e){} });
      await p.waitForTimeout(300);
      await openCarSelect(p);
  }},
  { id: 'S7', desc: '화차선택 최대(연결8+선로8)', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => { try{ startMission(); }catch(e){} });
      await p.waitForTimeout(300);
      await openCarSelect(p, 8);
  }},
  { id: 'S8', desc: '미션없이 화차선택만', setup: async (p) => {
      await startGame(p);
      await openCarSelect(p);
  }},
  { id: 'S9', desc: '최장 토스트', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => {
        try{ showToast('⚠️ 본선에 직원이 있습니다. Shift키를 눌러 주의기적을 울려주세요', 60000); }catch(e){}
      });
      await p.waitForTimeout(300);
  }},
  { id: 'S10', desc: '사상사고 오버레이', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => {
        try{ triggerCrash('🚑 사상사고 발생', '본선 직원이 기관차/화차와 접촉했습니다. 즉시 서행·경적 등 안전 조치가 필요합니다.'); }catch(e){}
      });
      await p.waitForTimeout(300);
  }},
  { id: 'S11', desc: '미션성공 오버레이', setup: async (p) => {
      await startGame(p);
      await p.evaluate(() => {
        const el = document.getElementById('missionSuccessOverlay');
        if(el) el.style.display = 'flex';
      });
      await p.waitForTimeout(200);
  }},
  { id: 'S12', desc: '랭킹 패널', setup: async (p) => {
      await startGame(p);
      await p.click('#rankToggleBtn').catch(()=>{});
      await p.waitForTimeout(300);
  }},
];

async function startGame(page){
  await page.fill('#operatorNameInput', '임승진').catch(()=>{});
  await page.click('#startBtn').catch(()=>{});
  await page.waitForTimeout(400);
  // 최초 입장 시 자동으로 뜨는 튜토리얼을 닫는다
  await page.evaluate(() => {
    const o = document.getElementById('tutorialOverlay');
    if(o) o.style.display = 'none';
  });
  await page.waitForTimeout(150);
}

async function openTutorial(page, stepIndex){
  await page.click('#tutorialToggleBtn').catch(()=>{});
  await page.waitForTimeout(200);
  for(let i=0;i<stepIndex;i++){
    await page.click('#tutNextBtn').catch(()=>{});
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(150);
}

/**
 * 화차선택 패널을 띄운다.
 * engineXY만 바꾸면 게임 루프의 stepEngine이 매 프레임 되돌려 놓으므로,
 * setCurrentEdge()로 기관차를 화차가 있는 선로 위에 실제로 올려놓아야 한다.
 */
async function openCarSelect(page, attached = 0){
  const ok = await page.evaluate((attached) => {
    try{
      // 화차가 가장 많은 선로 찾기
      let best = null, bestN = 0;
      for(const t in trackCars){
        if(trackCars[t].length > bestN){ bestN = trackCars[t].length; best = t; }
      }
      if(!best) return 'no-cars';

      // 그 선로에 해당하는 edge를 graphEdges에서 찾아 기관차를 올린다
      const edge = graphEdges.find(e => edgeTrackName(e) === best);
      if(!edge) return 'no-edge:' + best;
      setCurrentEdge(edge, edge.len * 0.5);
      vScreen = 0;

      if(attached > 0){
        for(let i=0; i<attached && trackCars[best].length; i++){
          const c = trackCars[best].shift();
          if(c) attachedCars.push(c);
        }
      }
      if(typeof updateCarSelectPanel === 'function') updateCarSelectPanel();
      if(typeof layoutTopLeftPanels === 'function') layoutTopLeftPanels();
      return 'ok:' + best + ':' + bestN;
    }catch(e){ return 'err:' + e.message; }
  }, attached);
  await page.waitForTimeout(500);
  // 패널이 실제로 떴는지 확인 — 안 떴으면 그 상태의 검사 결과는 의미가 없다
  const shown = await page.evaluate(() => {
    const p = document.getElementById('carSelectPanel');
    return !!p && getComputedStyle(p).display !== 'none';
  });
  return { ok, shown };
}

// ---------------------------------------------------------------- 브라우저 내 검사
const AUDIT_FN = ({ fontMin, touchMin, overlapMax, touchWhitelist }) => {
  const out = { overlaps: [], offscreen: [], touch: [], fonts: [], info: {} };

  const vw = window.innerWidth, vh = window.innerHeight;
  out.info.classes = document.body.className;
  out.info.viewport = vw + 'x' + vh;

  // 조상의 opacity/display까지 봐야 한다. 시작화면은 .hidden으로 opacity:0이 되지만
  // 그 안의 버튼 자체는 opacity:1이라 자기 스타일만 보면 "보인다"고 오판한다.
  const visible = (el) => {
    let node = el;
    while(node && node !== document.documentElement){
      const cs = getComputedStyle(node);
      if(cs.display === 'none' || cs.visibility === 'hidden') return false;
      if(parseFloat(cs.opacity) < 0.05) return false;
      node = node.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // SVG 요소는 className이 SVGAnimatedString이라 문자열 연산이 깨진다.
  const nameOf = (el) => {
    if(el.id) return '#' + el.id;
    const cls = el.getAttribute && el.getAttribute('class');
    if(cls && cls.trim()) return '.' + cls.trim().split(/\s+/)[0];
    return el.tagName.toLowerCase();
  };

  // ---- 1) 겹침 ----
  const WATCH = [
    '#gameStartBtn', '#gameEndBtn', '#homeBtn', '#rankToggleBtn', '#tutorialToggleBtn',
    '#musicToggleBtn', '#adminToggleBtn', '#installBtn',
    '#missionPanel', '#carSelectPanel', '#hudPanel', '#statusPanel',
    // #controlPad는 데스크톱에서 제일 큰 요소인데 그동안 감시 밖이었다.
    // 이게 없으면 패드↔HUD, 패드↔제작자표기 겹침을 못 잡는다.
    '#controlPad',
    '.pad-left', '.pad-right', '.credit-tag', '#actionToast',
  ];
  const boxes = [];
  for(const sel of WATCH){
    const el = document.querySelector(sel);
    if(!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    boxes.push({ sel, el, r });
  }
  for(let i=0;i<boxes.length;i++){
    for(let j=i+1;j<boxes.length;j++){
      const a = boxes[i], b = boxes[j];
      if(a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
      const y = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      const area = x * y;
      if(area > overlapMax){
        out.overlaps.push({
          a: a.sel, b: b.sel, area: Math.round(area),
          w: Math.round(x), h: Math.round(y),
        });
      }
    }
  }
  // 뷰포트 이탈
  for(const { sel, r } of boxes){
    const over = [];
    if(r.left < -1) over.push('left ' + Math.round(r.left));
    if(r.top < -1) over.push('top ' + Math.round(r.top));
    if(r.right > vw + 1) over.push('right +' + Math.round(r.right - vw));
    if(r.bottom > vh + 1) over.push('bottom +' + Math.round(r.bottom - vh));
    if(over.length) out.offscreen.push({ sel, over: over.join(', ') });
  }

  // ---- 1-b) UI가 지도 글자를 가리는지 ----
  // 사용자가 실제로 보는 "버튼과 겹치는 글자"는 대부분 이것이다.
  // 선로명·본선번호 같은 SVG 텍스트가 불투명한 UI 뒤로 숨는 경우를 잡는다.
  const mapTexts = [];
  for(const t of document.querySelectorAll('#trackSvg text')){
    if(!visible(t)) continue;
    const r = t.getBoundingClientRect();
    if(r.width <= 0 || r.height <= 0) continue;
    // 화면 밖 라벨은 관심 없음
    if(r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    mapTexts.push({ txt: (t.textContent||'').trim().slice(0,14), r, cls: nameOf(t) });
  }
  out.info.mapTextCount = mapTexts.length;

  for(const ui of boxes){
    // 지도를 덮는 게 당연한 전체 오버레이는 제외
    if(ui.sel === '#actionToast') continue;
    for(const mt of mapTexts){
      const x = Math.max(0, Math.min(ui.r.right, mt.r.right) - Math.max(ui.r.left, mt.r.left));
      const y = Math.max(0, Math.min(ui.r.bottom, mt.r.bottom) - Math.max(ui.r.top, mt.r.top));
      const area = x * y;
      if(area <= overlapMax) continue;
      const ratio = area / (mt.r.width * mt.r.height);
      // 글자 면적의 15% 이상이 가려지면 읽는 데 지장이 있다고 본다
      if(ratio < 0.15) continue;
      out.overlaps.push({
        a: ui.sel, b: '지도글자 "' + mt.txt + '"',
        area: Math.round(area), w: Math.round(x), h: Math.round(y),
        hidden: Math.round(ratio*100) + '%',
      });
    }
  }

  // ---- 1-c) 지도 글자끼리 겹침 ----
  for(let i=0;i<mapTexts.length;i++){
    for(let j=i+1;j<mapTexts.length;j++){
      const a = mapTexts[i], b = mapTexts[j];
      const x = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
      const y = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      const area = x * y;
      if(area <= overlapMax) continue;
      const minArea = Math.min(a.r.width*a.r.height, b.r.width*b.r.height);
      if(area / minArea < 0.15) continue;
      out.overlaps.push({
        a: '지도글자 "' + a.txt + '"', b: '지도글자 "' + b.txt + '"',
        area: Math.round(area), w: Math.round(x), h: Math.round(y),
        hidden: Math.round(area/minArea*100) + '%',
      });
    }
  }

  // ---- 2) 실효 터치 히트박스 ----
  // getBoundingClientRect만으로는 ::after로 넓힌 히트영역을 못 잡으므로
  // 중심에서 바깥으로 짚어가며 실제로 그 버튼이 잡히는 범위를 잰다.
  // 조상(t.contains(el))을 인정하면 부모 패널 전체가 히트영역으로 잡혀
  // 16px 버튼이 68px로 측정되는 오판이 난다. 자기 자신과 자손만 인정한다.
  const hitOwner = (el, x, y) => {
    const t = document.elementFromPoint(x, y);
    return t && (t === el || el.contains(t));
  };
  const measureHit = (el) => {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
    if(!hitOwner(el, cx, cy)) return null;  // 다른 요소에 가려짐
    const probe = (dx, dy) => {
      let d = 0;
      for(let i=2;i<=60;i+=2){
        const x = cx + dx*i, y = cy + dy*i;
        if(x < 0 || y < 0 || x > vw || y > vh) break;
        if(!hitOwner(el, x, y)) break;
        d = i;
      }
      return d;
    };
    return { w: probe(-1,0) + probe(1,0), h: probe(0,-1) + probe(0,1), covered: false };
  };
  const BTN_SEL = 'button, .mini-btn, .car-btn, .cs-small-btn, .mpad-btn, .mpad-btn-small, .ov-head';
  for(const el of document.querySelectorAll(BTN_SEL)){
    if(!visible(el)) continue;
    // Admin 패널 내부는 범위 밖
    if(el.closest('#adminPanel')) continue;
    const name = nameOf(el);
    if(touchWhitelist.includes(name)) continue;
    const m = measureHit(el);
    const r = el.getBoundingClientRect();
    if(!m){
      out.touch.push({ sel: name, text: (el.textContent||'').trim().slice(0,12), issue: '가려짐',
                       box: Math.round(r.width)+'x'+Math.round(r.height) });
      continue;
    }
    if(m.w < touchMin || m.h < touchMin){
      out.touch.push({ sel: name, text: (el.textContent||'').trim().slice(0,12),
                       hit: Math.round(m.w)+'x'+Math.round(m.h),
                       box: Math.round(r.width)+'x'+Math.round(r.height) });
    }
  }

  // ---- 3) 폰트 ----
  const seen = new Map();
  const all = document.querySelectorAll('body *');
  for(const el of all){
    if(el.closest('#adminPanel')) continue;
    if(!visible(el)) continue;
    // 직접 텍스트를 가진 요소만
    let hasText = false;
    for(const n of el.childNodes){
      if(n.nodeType === 3 && n.textContent.trim().length) { hasText = true; break; }
    }
    if(!hasText) continue;

    const tag = el.tagName.toLowerCase();
    let px;
    if(tag === 'text' || el.namespaceURI === 'http://www.w3.org/2000/svg'){
      // SVG는 font-size가 viewBox 단위 → 실제 화면 높이로 환산
      const r = el.getBoundingClientRect();
      px = r.height;  // 대문자 높이에 가까운 근사값
    } else {
      px = parseFloat(getComputedStyle(el).fontSize);
    }
    if(px >= fontMin) continue;
    const name = nameOf(el);
    const key = name + '|' + px.toFixed(1);
    if(seen.has(key)) { seen.get(key).count++; continue; }
    seen.set(key, { sel: name, px: +px.toFixed(1), sample: (el.textContent||'').trim().slice(0,16), count: 1 });
  }
  out.fonts = [...seen.values()].sort((a,b)=>a.px-b.px);

  return out;
};

// ---------------------------------------------------------------- 실행
function parseArgs(){
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i+1] : null; };
  return {
    profile: get('--profile'),
    state: get('--state'),
    label: get('--label') || 'run',
    // 검사할 사본의 경로. 한 번 도는 데 15~30분이 걸리므로, 스냅샷을 떠서
    // 그쪽을 검사하게 하면 그동안 저장소의 index.html을 계속 편집할 수 있다.
    root: get('--root'),
    port: Number(get('--port')) || PORT,
    quiet: a.includes('--quiet'),
  };
}

async function main(){
  const args = parseArgs();
  const root = args.root ? path.resolve(args.root) : REPO_ROOT;
  const port = args.port;
  console.log(`검사 대상: ${root}  (포트 ${port})`);
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));

  // --profile / --state 는 쉼표로 여러 개 지정할 수 있다
  const pick = (v) => v ? v.split(',').map(x=>x.trim()) : null;
  const wantP = pick(args.profile), wantS = pick(args.state);
  const profiles = wantP ? PROFILES.filter(p => wantP.includes(p.name)) : PROFILES;
  const states = wantS ? STATES.filter(s => wantS.includes(s.id)) : STATES;
  if(!profiles.length){ console.error('알 수 없는 프로필:', args.profile); process.exit(2); }
  if(!states.length){ console.error('알 수 없는 상태:', args.state); process.exit(2); }

  const browser = await chromium.launch();
  const results = [];
  let totalOverlap = 0, totalTouch = 0, totalFont = 0, totalOff = 0;

  try{
    for(const prof of profiles){
      const ctxOpts = {
        viewport: { width: prof.w, height: prof.h },
        deviceScaleFactor: 2,
      };
      if(prof.mobile){
        ctxOpts.userAgent = prof.ua;
        ctxOpts.isMobile = true;
        ctxOpts.hasTouch = true;
      }
      const ctx = await browser.newContext(ctxOpts);
      await ctx.route(/(gstatic\.com\/firebasejs|firebaseio\.com|firebasedatabase\.app)/,
                      route => route.abort());
      const dir = path.join(SHOT_DIR, args.label, prof.name);
      mkdirSync(dir, { recursive: true });

      for(const st of states){
        const page = await ctx.newPage();
        // 난수 고정. 게임은 화차 번호(genCarNumber)·야드 초기 배치·미션 생성·NPC 배회를
        // 전부 Math.random()으로 만들기 때문에, 이걸 두면 같은 화면을 두 번 찍어도
        // 야드가 달라져서 "이전 대비 안 변했는가"를 스크린샷으로 확인할 수 없다.
        // addInitScript는 페이지 스크립트보다 먼저 돌므로 게임이 첫 난수를 뽑기 전에 갈아끼운다.
        await page.addInitScript(() => {
          let s = 0x9e3779b9;                      // 고정 시드
          Math.random = function(){                // mulberry32
            s |= 0; s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        });
        // 이 하네스는 실서비스 Firebase 랭킹에 절대 쓰면 안 된다.
        // S10(사고)이나 미션 완료가 updateRankRecord -> saveRankRecords -> firebaseDb.set 을 타고
        // 공용 기록을 덮어쓴 적이 있다. SDK를 window.firebase 수준에서 감싸는 방식은
        // 게임이 먼저 firebase.database()를 잡아가면 늦어서 막지 못했다.
        // 확실한 방법은 SDK와 DB 통신 자체를 네트워크에서 끊는 것이다.
        // firebaseDb가 없으면 게임은 경고만 남기고 정상 동작한다(랭킹은 비어 보인다).
        page.on('pageerror', e => {
          results.push({ profile: prof.name, state: st.id, jsError: String(e).slice(0, 200) });
        });
        await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        try{ await st.setup(page); }catch(e){ /* 상태 구성 실패는 아래 audit에서 드러난다 */ }
        await page.waitForTimeout(200);

        const audit = await page.evaluate(AUDIT_FN, {
          fontMin: prof.mobile ? FONT_MIN_MOBILE : FONT_MIN_DESKTOP,
          touchMin: TOUCH_MIN, overlapMax: OVERLAP_MAX,
          touchWhitelist: [...TOUCH_WHITELIST],
        });
        // 스크린샷 직전에 화면을 "정지"시킨다. 이걸 안 하면 같은 코드로 두 번 찍어도
        // 픽셀이 달라져서 "이전 대비 안 변했는가"를 PNG 비교로 확인할 수 없다.
        //   - 애니메이션/전환: btnShine(3.2s)·ringSpin(6s)·hornPop
        //   - NPC(수송원·본선직원): 시간에 따라 계속 걸어다닌다. 실측 결과 난수를 고정한
        //     뒤에도 화면 차이의 유일한 원인이 이것이었다(55x93px, 전체의 0.18%).
        //     NPC 그림 자체를 확인해야 할 땐 이 하네스 말고 별도 스크린샷을 쓸 것.
        await page.addStyleTag({ content:
          '*,*::before,*::after{animation:none!important;transition:none!important}' +
          '#workerFigure,#mainWorkerFigure{visibility:hidden!important}' });
        await page.waitForTimeout(60);
        await page.screenshot({ path: path.join(dir, `${st.id}.png`) });
        await page.close();

        totalOverlap += audit.overlaps.length;
        totalTouch += audit.touch.length;
        totalFont += audit.fonts.length;
        totalOff += audit.offscreen.length;
        results.push({ profile: prof.name, state: st.id, desc: st.desc, ...audit });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  // ---- 리포트 ----
  const report = { label: args.label, totals: { totalOverlap, totalOff, totalTouch, totalFont }, results };
  writeFileSync(path.join(SHOT_DIR, args.label + '.json'), JSON.stringify(report, null, 2));

  console.log('='.repeat(72));
  console.log(`감사 결과 [${args.label}]  겹침 ${totalOverlap} · 화면이탈 ${totalOff} · 터치 ${totalTouch} · 폰트 ${totalFont}`);
  console.log('='.repeat(72));

  for(const r of results){
    const issues = (r.overlaps?.length||0) + (r.offscreen?.length||0) + (r.touch?.length||0) + (r.fonts?.length||0);
    if(!issues && !r.jsError) continue;
    console.log(`\n▸ ${r.profile} / ${r.state} (${r.desc||''})  [${r.info?.classes||''}]`);
    if(r.jsError) console.log(`  ⛔ JS 오류: ${r.jsError}`);
    for(const o of r.overlaps||[]) console.log(`  겹침   ${o.a} ↔ ${o.b}  ${o.w}x${o.h}px (${o.area}px²)`);
    for(const o of r.offscreen||[]) console.log(`  이탈   ${o.sel}  ${o.over}`);
    if(!args.quiet){
      for(const t of r.touch||[]) console.log(`  터치   ${t.sel} "${t.text}"  히트 ${t.hit||t.issue} / 박스 ${t.box}`);
      for(const f of r.fonts||[]) console.log(`  폰트   ${f.sel}  ${f.px}px  "${f.sample}" ${f.count>1?'×'+f.count:''}`);
    }
  }
  console.log(`\n스크린샷: ${path.join(SHOT_DIR, args.label)}`);
  console.log(`리포트:   ${path.join(SHOT_DIR, args.label + '.json')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
