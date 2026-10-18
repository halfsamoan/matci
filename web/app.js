import {layoutNotches} from './dockModel.js';

// This browser UI only changes synthetic state. It never reads processes or closes apps.
const $ = selector => document.querySelector(selector);
const state = {
  page: 'memory', scenario: 'normal', selected: new Set(), sportEnabled: true,
  owner: null, review: false, acknowledged: false, busy: false, receipt: null,
  history: [], closed: new Set(), goal: false, homeScore: 1, pendingGoal: false, goalTimer: null,
  suggestions: false, threshold: 85, reducedMotion: false, partialResult: false,
};
const candidates = [
  {id:'chrome', name:'Google Chrome', symbol:'◉', memory:744, windows:3, reason:'6분 동안 입력 없음 · 브라우저 작업 상태는 알 수 없음', detail:'열린 창 3개 전체가 닫기 대상입니다. 재생·다운로드·작성 중인 내용은 확인할 수 없습니다.'},
  {id:'image', name:'이미지 뷰어', symbol:'▧', memory:164, windows:1, reason:'24분 동안 입력 없음 · 열린 창 1개', detail:'열린 창 1개에 정상 닫기를 요청합니다. 저장 여부는 앱의 확인창에서 결정합니다.'},
  {id:'files', name:'파일', symbol:'▱', memory:92, windows:1, reason:'18분 동안 입력 없음 · 열린 창 1개', detail:'열린 창 1개에 정상 닫기를 요청합니다. 진행 중인 파일 작업은 직접 확인하세요.'},
];
const protectedApps = [
  {name:'Terminal · Codex',symbol:'›_',memory:'1.20 GiB',reason:'터미널·에이전트 작업 보호 · 선택할 수 없음'},
  {name:'코드 편집기',symbol:'⌘',memory:'920 MiB',reason:'개발 도구 보호 · 선택할 수 없음'},
];
const available = () => state.scenario === 'empty' ? [] : candidates.filter(app => !state.closed.has(app.id));
const chosen = () => available().filter(app => state.selected.has(app.id));
const totalSelected = () => chosen().reduce((sum,app) => sum + app.memory, 0);
const formatMiB = value => value >= 1024 ? `${(value/1024).toFixed(2)} GiB` : `${value} MiB`;
const announce = text => { $('#live-status').textContent = text; };
const metricPercent = () => state.scenario === 'offline' ? '—' : state.receipt?.delta > 0 ? '71' : '75';
const demoLabel = '<span class="demo-indicator">시연 데이터 · 실제 앱 변경 없음</span>';
const memIcon = '<span class="memory-bars" aria-hidden="true"><i></i><i></i><i></i></span>';

function claim(id, priority, focus = false) {
  if (state.owner && state.owner.priority > priority) return false;
  clearTimeout(state.goalTimer);
  state.owner = {id,priority};
  renderDock();
  if (focus) document.querySelector(`#${id}-body button`)?.focus({preventScroll:true});
  return true;
}

function collapse(returnFocus = true) {
  if (state.review || state.busy) return;
  const previous = state.owner?.id;
  clearTimeout(state.goalTimer);
  state.owner = null;
  state.goal = false;
  renderDock();
  if (returnFocus && previous) document.querySelector(`#${previous}-island .island-header`)?.focus({preventScroll:true});
}

function openManual(id) {
  if (state.review || state.busy) return;
  state.owner = null;
  claim(id,100);
}

function renderDock() {
  const focusedDockId = document.activeElement?.closest('.island') ? document.activeElement.id : null;
  const memoryExpanded = state.owner?.id === 'memory';
  const sportExpanded = state.owner?.id === 'sport';
  const memory = $('#memory-island');
  const sport = $('#sport-island');
  memory.classList.toggle('expanded', memoryExpanded);
  sport.classList.toggle('expanded', sportExpanded);
  const offline = state.scenario === 'offline';
  const label = state.busy ? '닫기 요청 관측 중' : state.review ? '선택 검토 중' : `RAM ${metricPercent()}%`;
  memory.innerHTML = `<button type="button" id="memory-trigger" class="island-header" data-action="toggle-memory" aria-expanded="${memoryExpanded}" aria-controls="memory-body" aria-label="matci 메모리 ${metricPercent()}퍼센트, ${memoryExpanded?'접기':'펼치기'}">${memIcon}<span class="notch-title">${label}</span><span class="notch-sub">${offline?'관측 중단':state.scenario==='partial'?'일부 관측':state.review?'직접 확인':state.pendingGoal?'골 대기 중':'matci'}</span></button>
  <div class="island-body" id="memory-body" ${memoryExpanded?'':'inert'}><p class="island-description">${state.review?'검토하는 동안 다른 알림은 기다립니다.':offline?'마지막 값을 실제 상태로 표시하지 않습니다.':'필요한 작업은 보호하고, 후보는 직접 선택하세요.'}</p><div class="mini-metric"><strong>${metricPercent()}<span>%</span></strong><span>${offline?'현재 수치 없음':`${state.receipt?.delta>0?'10.65':'11.25'} / 15.00 GiB · 합성 RAM`}</span></div><div class="memory-bar"><span class="used" style="width:${offline?0:metricPercent()}%"></span></div><div class="mini-footer"><p>${state.review?'검토 우선순위 100':state.selected.size?`${state.selected.size}개 앱 선택됨`:`${available().length}개 후보 · 자동 종료 안 함`}</p><button type="button" data-action="open-memory" ${state.review?'disabled':''}>메모리 보기 ↗</button></div></div>`;
  const score = `${state.homeScore} : 1`;
  sport.innerHTML = `<button type="button" id="sport-trigger" class="island-header" data-action="toggle-sport-island" aria-expanded="${sportExpanded}" aria-controls="sport-body" aria-label="Archsport Barcelona ${score}, ${sportExpanded?'접기':'펼치기'}"><span class="sport-score"><img src="./assets/logos/529.png" alt="FC Barcelona"><b>${score}</b><img src="./assets/logos/505.png" alt="Inter"></span><span class="notch-sub">${state.goal?'골 · 시연':'67′ · 시연'}</span></button><div class="island-body" id="sport-body" ${sportExpanded?'':'inert'}><p class="island-description">Archsport · 합성 경기, 실제 중계 아님</p><div class="match-detail"><span class="match-team"><img src="./assets/logos/529.png" alt="">Barcelona</span><strong>${score}</strong><span class="match-team"><img src="./assets/logos/505.png" alt="">Inter</span></div><div class="mini-footer"><p class="${state.goal?'event-text':''}">${state.goal?'골! · 시연 선수 · 68′':'후반 67′ · 가상 경기'}</p><button type="button" data-action="collapse">접기</button></div></div>`;
  const width = window.innerWidth;
  const entries = [{id:'memory',width:memoryExpanded?460:336,height:memoryExpanded?224:46,order:1,active:memoryExpanded}];
  if (state.sportEnabled) entries.push({id:'sport',width:sportExpanded?460:336,height:sportExpanded?224:46,order:0,active:sportExpanded});
  const positions = layoutNotches(entries,{x:0,y:0,width,panelHeight:32},12,12);
  memory.hidden = false;
  sport.hidden = !state.sportEnabled;
  let fallbackId = null;
  for (const item of positions) {
    const node = $(`#${item.id}-island`);
    node.hidden = item.fallback;
    node.style.left = `${item.x}px`;
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    if (item.fallback) fallbackId = item.id;
  }
  const companion = $('#companion');
  companion.hidden = !fallbackId;
  if (fallbackId) {
    companion.dataset.target = fallbackId;
    companion.textContent = fallbackId==='memory'?'▤ matci':'⚽ 경기';
    companion.setAttribute('aria-label',fallbackId==='memory'?'패널의 matci 노치 열기':'패널의 Archsport 노치 열기');
    companion.disabled = state.review || state.busy;
  }
  if (focusedDockId) {
    const replacement = document.getElementById(focusedDockId);
    if (replacement && !replacement.closest('[hidden]')) replacement.focus({preventScroll:true});
    else if (!companion.hidden && !companion.disabled) companion.focus({preventScroll:true});
  }
}

function heading(title, subtitle, action='') {
  return `<div class="page-heading"><div><h1 id="page-title" tabindex="-1">${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function appRow(app) {
  return `<label class="app-row" for="select-${app.id}"><input type="checkbox" id="select-${app.id}" name="app-selection" value="${app.id}" ${state.selected.has(app.id)?'checked':''} ${state.scenario==='offline'?'disabled':''}><span class="app-symbol" aria-hidden="true">${app.symbol}</span><span><span class="app-name">${app.name}</span><span class="app-reason">${app.reason}</span></span><span class="app-memory">${formatMiB(app.memory)}<small>${state.scenario==='partial'&&app.id==='chrome'?'RSS · 일부 프로세스':'PSS · 합성값'}</small></span></label>`;
}

function memoryPage() {
  const offline = state.scenario==='offline';
  const apps = available();
  const count = chosen().length;
  let content = heading('메모리', '앱을 닫기 전에, 지금 하는 일을 먼저 확인하세요.', '<button type="button" data-action="refresh">↻ 다시 관측</button>');
  if (offline) content += '<div class="notice error">관측이 중단되었습니다. 현재 RAM과 앱 상태를 알 수 없어 닫기 요청을 사용할 수 없습니다. 시연 제어에서 기본 관측으로 돌아갈 수 있습니다.</div>';
  if (state.scenario==='partial') content += '<div class="notice">일부 프로세스를 읽지 못했습니다. Chrome은 RSS 대체값이며 전체 메모리와 직접 합산할 수 없습니다. 읽기 실패를 0으로 처리하지 않습니다.</div>';
  content += `<div class="memory-overview"><div><div class="memory-value">${offline?'—':state.receipt?.delta>0?'10.65':'11.25'}<span>/ 15.00 GiB</span></div><p class="memory-caption">${offline?'현재 관측값 없음':'전체 RAM의 '+metricPercent()+'% 사용 · 합성 관측'}</p><div class="memory-bar"><span class="used" style="width:${offline?0:metricPercent()}%"></span></div><div class="memory-legend"><span><i class="legend-key"></i>사용 중</span><span><i class="legend-key free"></i>사용 가능 ${offline?'—':state.receipt?.delta>0?'4.35':'3.75'} GiB</span></div></div><div class="pressure"><small>메모리 압력 · PSI</small><strong>${offline?'알 수 없음':'0.0% · 낮음'}</strong><small>최근 10초 · 시연</small></div></div>`;
  if (state.receipt) content += `<div class="notice">최근 시연 결과: ${state.receipt.completed}개 앱의 선택 창 닫힘 관측${state.receipt.partial?' · 일부 대기 중':''}. 사용 가능 RAM 차이 +${state.receipt.delta} MiB. 특정 앱의 회수량을 뜻하지 않습니다.</div>`;
  content += '<div class="section-heading"><h2>입력 없는 앱</h2><span class="amount">자동 선택 없음</span></div>';
  if (!apps.length) content += '<div class="empty-state"><div class="empty-icon" aria-hidden="true">✓</div><h2>지금 제안할 앱이 없어요</h2><p>아무것도 닫을 필요가 없습니다. 작업을 이어가세요.</p><button type="button" data-action="reset">시연 처음으로</button></div>';
  else content += `<div class="app-list" ${offline?'inert':''}>${apps.map(appRow).join('')}<p class="list-note">입력이 없었다는 사실만으로 앱이 안전하다고 판단하지 않습니다.</p></div>`;
  content += `<div class="protected"><div class="section-heading"><h2>작업 보호</h2><span class="amount">${protectedApps.length}개 앱</span></div>${protectedApps.map(app=>`<div class="app-row"><span class="lock" aria-label="보호됨">◇</span><span class="app-symbol" aria-hidden="true">${app.symbol}</span><span><span class="app-name">${app.name}</span><span class="app-reason">${app.reason}</span></span><span class="app-memory">${app.memory}<small>PSS · 합성값</small></span></div>`).join('')}</div>`;
  content += `<div class="action-bar"><p><strong id="selection-summary">${count?count+'개 앱 선택됨':'닫을 앱을 직접 선택하세요'}</strong><br><span id="selection-detail">${count?formatMiB(totalSelected())+' 관측 · 확보량 보장 아님':'강제 종료 없이, 정상 닫기만 요청합니다.'}</span></p><button type="button" class="primary" id="review-selection" data-action="review" ${!count||offline?'disabled':''}>선택 검토${count?' · '+count+'개':''}</button></div><p class="list-note">전체 RAM 사용률 = (MemTotal − MemAvailable) ÷ MemTotal. 앱별 PSS/RSS와 별개의 지표입니다.</p>`;
  return content;
}

function historyPage() {
  let content = heading('작업 기록', '요청과 관측을 나누어 기록합니다. 모든 항목은 이번 시연의 결과입니다.', state.history.length?'<button type="button" data-action="clear-history">시연 기록 지우기</button>':'');
  if (!state.history.length) return content+'<div class="empty-state"><div class="empty-icon" aria-hidden="true">◷</div><h2>아직 작업 기록이 없어요</h2><p>메모리 화면에서 앱을 선택하고 닫기 시연을 진행하면<br>요청·관측 결과가 여기에 남습니다.</p><button type="button" data-action="open-memory">메모리로 돌아가기</button></div>';
  return content+state.history.map(receipt=>`<article class="history-row"><div class="history-top"><strong>${receipt.names.join(', ')}</strong><span class="status-label ${receipt.partial?'partial':''}">${receipt.partial?'일부 대기':'관측 완료'}</span></div><p>${receipt.time} · 정상 닫기 시연 · ${receipt.completed}개 앱의 선택 창 닫힘 관측</p><p>사용 가능 RAM 차이 <strong>+${receipt.delta} MiB</strong> · 다른 작업도 영향을 줄 수 있음</p><p>${receipt.partial?'1개 앱은 저장 확인 또는 응답 대기 상태입니다. 강제 종료하지 않았습니다.':'백그라운드 프로세스가 남을 수 있습니다. 앱 종료와 같은 뜻이 아닙니다.'}</p></article>`).join('')+'<p class="setting-note">이 시연 기록은 새로고침하면 사라집니다. 문서 제목이나 명령행을 수집하지 않습니다.</p>';
}

function settingsPage() {
  return heading('설정', '시연 중에만 적용됩니다. Linux에서는 GNOME 설정을 사용합니다.')+`
  <div class="setting-row"><div><h2>메모리 제안 알림</h2><p>임계값 이상이 30초 지속되면 알려줍니다.<br>자동으로 앱을 닫지 않습니다.</p></div><label><span class="sr-only">메모리 제안 알림 사용</span><input type="checkbox" name="suggestions" id="suggestions" ${state.suggestions?'checked':''}></label></div>
  <div class="threshold-group"><label for="threshold">알림 임계값 <output id="threshold-value">${state.threshold}%</output></label><input id="threshold" name="threshold" type="range" min="50" max="99" value="${state.threshold}" ${state.suggestions?'':'disabled'}><p>75% 아래에서 재무장 · 알림 간격 10분. 이 웹 화면은 실제 RAM을 관측하지 않습니다.</p><button type="button" data-action="memory-alert" ${state.suggestions?'':'disabled'} style="margin-top:12px">제안 알림 시연</button></div>
  <div class="setting-row"><div><h2>모션 줄이기</h2><p>노치 크기와 위치를 즉시 바꿉니다.<br>OS의 모션 감소 설정도 함께 존중합니다.</p></div><label><span class="sr-only">모션 줄이기</span><input type="checkbox" name="reduced-motion" id="reduced-motion" ${state.reducedMotion?'checked':''}></label></div>
  <div class="setting-row"><div><h2>일부 닫힘 결과 시연</h2><p>마지막 앱이 저장 확인을 기다리는 상태를 만듭니다.</p></div><label><span class="sr-only">일부 닫힘 결과 시연 사용</span><input type="checkbox" name="partial-result" id="partial-result" ${state.partialResult?'checked':''}></label></div>
  <div class="setting-row"><div><h2>두 노치 공존</h2><p>확장 화면은 한 번에 하나만 열립니다.<br>좁은 화면에서는 동반 앱이 상단 패널 버튼으로 이동합니다.</p></div><span class="status-label">켜짐</span></div>
  <p class="setting-note">메모리 검토 100 → 경기 이벤트 80 → 메모리 제안 30 순으로 표시합니다. 이벤트는 키보드 포커스를 가져가지 않습니다.</p><p class="setting-note">디스크 분석·폴더 정리는 후속 단계입니다. 현재 버전은 메모리 관측과 수동 정상 닫기에 집중합니다.</p>`;
}

function renderPage(focus = false) {
  $('#content').innerHTML = state.page==='memory'?memoryPage():state.page==='history'?historyPage():settingsPage();
  document.querySelectorAll('[data-page]').forEach(button=> {
    if(button.dataset.page===state.page) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  $('#history-count').textContent = state.history.length || '';
  if(focus) $('#page-title')?.focus({preventScroll:true});
}

function updateSelection() {
  const count=chosen().length;
  $('#selection-summary').textContent=count?`${count}개 앱 선택됨`:'닫을 앱을 직접 선택하세요';
  $('#selection-detail').textContent=count?`${formatMiB(totalSelected())} 관측 · 확보량 보장 아님`:'강제 종료 없이, 정상 닫기만 요청합니다.';
  $('#review-selection').disabled=!count||state.scenario==='offline';
  $('#review-selection').textContent=`선택 검토${count?' · '+count+'개':''}`;
  renderDock();
}

function openReview() {
  if(!chosen().length || state.scenario==='offline' || state.review) return;
  state.review=true;
  state.acknowledged=false;
  claim('memory',100);
  const dialog=$('#review-dialog');
  dialog.innerHTML=`<h2 id="review-title">정상 닫기 요청 전 확인</h2><p class="dialog-description">${chosen().length}개 앱 · ${chosen().reduce((sum,app)=>sum+app.windows,0)}개 창을 선택했습니다. 탭 하나가 아닌 선택한 앱의 모든 대상 창에 요청합니다.</p><div class="review-list">${chosen().map(app=>`<div class="review-item"><div><strong>${app.name}</strong><p>${app.detail}</p></div><span>${app.windows}개 창</span></div>`).join('')}</div><p class="review-warning">저장하지 않은 작업이 있을 수 있습니다. 앱의 저장 확인창을 기다리며, 요청 후에도 백그라운드 프로세스는 남을 수 있습니다.</p><label class="review-confirm"><input type="checkbox" id="acknowledge" name="acknowledge"> <span>대상 창과 작업 손실 가능성을 확인했습니다.</span></label><label class="review-confirm"><input type="checkbox" id="review-partial" name="review-partial" ${state.partialResult?'checked':''}> <span>저장 확인 대기 결과도 시연하기</span></label><div class="review-buttons"><button type="button" data-action="cancel-review">취소</button><button type="button" id="confirm-close" class="primary" data-action="confirm-close" disabled>정상 닫기 시연</button></div>${demoLabel}<p class="keyboard-hint">Esc로 취소 · Alt+G로 검토 중 골 알림 우선순위 확인</p>`;
  dialog.showModal();
  dialog.querySelector('[data-action="cancel-review"]').focus();
  announce('선택 검토가 열렸습니다. 앱은 아직 변경하지 않았습니다.');
}

function cancelReview() {
  if(state.busy) return;
  state.review=false;
  $('#review-dialog').close();
  state.owner={id:'memory',priority:40};
  renderDock();
  $('#review-selection')?.focus({preventScroll:true});
  announce('선택 검토를 취소했습니다. 닫기 요청은 없었습니다.');
  flushGoal();
}

async function simulateClose() {
  if(state.busy || !state.acknowledged || !state.review) return;
  state.busy=true;
  const requested=chosen();
  const dialog=$('#review-dialog');
  dialog.innerHTML='<h2 id="review-title">요청 뒤 상태를 관측하는 중</h2><p class="dialog-description"><span class="loading-dot" aria-hidden="true"></span>정상 닫기 요청 → 창 상태 확인 → 결과 기록</p><p class="setting-note">강제 종료하지 않습니다. 이 대기는 합성 시연입니다.</p>'+demoLabel;
  renderDock();
  await new Promise(resolve=>setTimeout(resolve,state.reducedMotion?200:1100));
  const remaining=state.partialResult?requested.at(-1):null;
  const completed=requested.filter(app=>app!==remaining);
  completed.forEach(app=>state.closed.add(app.id));
  state.receipt={names:requested.map(app=>app.name),completed:completed.length,partial:Boolean(remaining),delta:completed.length?612:0,time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})};
  state.history.unshift(state.receipt);
  state.selected.clear();
  state.busy=false;
  state.review=false;
  dialog.close();
  state.owner={id:'memory',priority:40};
  state.page='history';
  renderPage(true);
  renderDock();
  announce(`${completed.length}개 앱의 선택 창 닫힘을 합성 관측했습니다.${remaining?' 한 앱은 저장 확인 또는 응답 대기 중입니다.':''} 실제 앱은 변경하지 않았습니다.`);
  flushGoal();
}

function showGoal() {
  if(!state.sportEnabled) {
    announce('Archsport가 꺼져 있습니다. 먼저 Archsport를 켜세요.');
    return;
  }
  if(!claim('sport',80)) {
    state.pendingGoal=true;
    renderDock();
    announce('골 시연이 도착했습니다. 진행 중인 수동 검토를 유지하고 경기 알림은 대기합니다.');
    return;
  }
  state.goal=true;
  state.homeScore=2;
  state.pendingGoal=false;
  renderDock();
  announce('합성 경기 골 시연: Barcelona 2 대 1 Inter.');
  state.goalTimer=setTimeout(()=>collapse(false),6000);
}

function flushGoal() {
  if(state.pendingGoal) {state.owner=null;showGoal();}
}

function reset() {
  clearTimeout(state.goalTimer);
  state.goal=false;state.homeScore=1;state.pendingGoal=false;state.owner=null;
  state.selected.clear();state.closed.clear();state.receipt=null;state.history=[];
  state.scenario='normal';state.page='memory';$('#scenario').value='normal';
  renderPage();renderDock();announce('합성 시연을 처음으로 되돌렸습니다.');
}

document.addEventListener('click',event=> {
  const button=event.target.closest('button');
  if(!button || button.disabled) return;
  if(button.dataset.page){state.page=button.dataset.page;renderPage(true);return;}
  switch(button.dataset.action){
    case 'toggle-memory': state.owner?.id==='memory'?collapse():openManual('memory');break;
    case 'toggle-sport-island': state.owner?.id==='sport'?collapse():openManual('sport');break;
    case 'open-memory': state.page='memory';renderPage(true);openManual('memory');break;
    case 'collapse': collapse();break;
    case 'review': openReview();break;
    case 'cancel-review':cancelReview();break;
    case 'confirm-close':simulateClose();break;
    case 'goal':showGoal();break;
    case 'toggle-sport':state.sportEnabled=!state.sportEnabled;button.textContent=`Archsport ${state.sportEnabled?'켜짐':'꺼짐'}`;button.setAttribute('aria-pressed',String(state.sportEnabled));if(!state.sportEnabled&&state.owner?.id==='sport')collapse(false);renderDock();break;
    case 'refresh':if(state.scenario==='offline'){announce('관측 중단 시연 중입니다. 메모리 상태를 기본 관측으로 바꾸세요.');}else{announce('합성 관측을 새로 읽었습니다. 실제 OS 정보는 사용하지 않았습니다.');button.textContent='✓ 시연 관측 갱신';}break;
    case 'reset':reset();break;
    case 'clear-history':state.history=[];renderPage(true);announce('시연 작업 기록을 지웠습니다.');break;
    case 'memory-alert':if(claim('memory',30)){announce('메모리 제안 알림 시연입니다. 자동 닫기는 하지 않습니다.');state.goalTimer=setTimeout(()=>collapse(false),6000);}else announce('더 높은 우선순위의 노치 화면을 유지합니다.');break;
  }
});

document.addEventListener('change',event=>{
  const input=event.target;
  if(input.name==='app-selection'){input.checked?state.selected.add(input.value):state.selected.delete(input.value);updateSelection();}
  if(input.id==='scenario'){state.scenario=input.value;state.selected.clear();renderPage();renderDock();announce(`${input.selectedOptions[0].textContent} 시연으로 변경했습니다.`);}
  if(input.id==='suggestions'){state.suggestions=input.checked;renderPage();$('#suggestions')?.focus();}
  if(input.id==='reduced-motion'){state.reducedMotion=input.checked;document.documentElement.classList.toggle('reduced-motion',input.checked);announce(input.checked?'모션을 줄였습니다.':'기본 Archsport 웹 모션을 사용합니다.');}
  if(input.id==='partial-result'||input.id==='review-partial')state.partialResult=input.checked;
  if(input.id==='acknowledge'){state.acknowledged=input.checked;$('#confirm-close').disabled=!input.checked;}
});
document.addEventListener('input',event=>{if(event.target.id==='threshold'){state.threshold=Number(event.target.value);$('#threshold-value').textContent=`${state.threshold}%`;}});
$('#companion').addEventListener('click',()=>openManual($('#companion').dataset.target));
$('#review-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelReview();});
document.addEventListener('keydown',event=>{
  if(event.altKey&&event.key.toLowerCase()==='g'){event.preventDefault();showGoal();}
  if(event.key==='Escape'&&!state.review&&!state.busy){collapse();}
});
window.addEventListener('resize',renderDock);
renderPage();
renderDock();
