const TOTAL_CELLS=20007;
const SECTOR_SIZE=500;
const START_OCCUPIED=2317;
let currentSector=1;
let selectedArchiveCell=null;

function occupiedCount2007(){
  // Production baseline. Реальные значения потом приходят из Supabase.
  return START_OCCUPIED;
}
function renderTopCounters2007(){
  const taken = occupiedCount2007();
  const free = TOTAL_CELLS - taken;
  const t=document.getElementById('statTotal'), f=document.getElementById('statFree'), o=document.getElementById('statTaken');
  if(t)t.textContent=String(TOTAL_CELLS);
  if(f)f.textContent=String(free).padStart(5,'0');
  if(o)o.textContent=String(taken);
}
function track2007(event, data={}){try{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event,...data});console.log('[Capsule2007]',event,data)}catch(e){}}

const specialArchiveCells=new Set([7,107,777,1337,2007,7777,11111,12345,16000,20007]);
const capsuleOwners=['Костя','Данил','Лена','Игорь','Макс','Света','Жека','Юля','Вова','Андрей','Сашка','Настя','Рома','Ира','Дима','Катя'];
function padCell(n){return String(n).padStart(5,'0')}

/* === Capsule2007 ownership / cell preview helpers === */
const capsuleSeedMemories=[
  'Мама кричала выключать комп, а мы доигрывали de_dust2.',
  'Папка D:\\Музыка была важнее любого облака.',
  'Ждал её в QIP до двух ночи. Она зашла и написала: привет :)',
  'DVD-R с надписью ВСЁ НУЖНОЕ до сих пор где-то у родителей.',
  'Скачивал музыку ночью, потому что днём интернет умирал.',
  'В клубе пахло пылью, дошираком и дешёвым кофе.',
  'NFS Underground казалась красивее настоящего города.',
  'ICQ пищала — и сердце реально ускорялось.',
  'Сервер full. Ждите слот. И мы ждали.',
  'Сохраняла его SMS, пока телефон не попросил удалить память.'
];
function capsuleSavedList(){
  try{return JSON.parse(localStorage.getItem('capsule2007_owned_cells')||'[]')}catch(e){return[]}
}
function capsuleSaveList(list){
  try{localStorage.setItem('capsule2007_owned_cells',JSON.stringify(list))}catch(e){}
}
function capsuleSavedFor(n){
  return capsuleSavedList().find(x=>Number(x.cell)===Number(n))||null;
}
window.capsuleSavedFor=capsuleSavedFor;
function capsuleMakeCode(){
  return Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
}
function capsuleSeedText(n){
  return capsuleSeedMemories[Math.abs(Number(n)*3)%capsuleSeedMemories.length];
}
function capsuleOwnerName(n){
  if(typeof ownerForCell==='function') return ownerForCell(n);
  const names=['Костя','Данил','Лена','Игорь','Макс','Света','Жека','Юля','Вова','Настя','Рома','Ира','Дима','Катя'];
  return names[Math.abs((Number(n)*7+String(n).charCodeAt(0)))%names.length];
}
function capsuleCellRecord(n){
  const saved=capsuleSavedFor(n);
  if(saved) return {cell:Number(n), nickname:saved.nickname, year:saved.year, text:saved.text, ownerCode:saved.ownerCode, local:true, status:saved.status||'pending'};
  const taken=(typeof seededTakenCell==='function') ? seededTakenCell(n) : false;
  if(taken) return {cell:Number(n), nickname:capsuleOwnerName(n), year:String(2004+(Number(n)%5)), text:capsuleSeedText(n), local:false, status:'published'};
  return null;
}
function openOccupiedCell(n){
  const r=capsuleCellRecord(n);
  if(!r){return}
  const status = r.local ? 'твоя локальная капсула · ожидает модерации' : 'опубликована';
  openActionModal('Ячейка #'+padCell(n), `Статус: ${status}\nВладелец: ${r.nickname}\nГод: ${r.year}\n\n“${r.text}”\n\nПостоянный адрес капсулы:\ncapsule2007.ru/cell/${padCell(n)}`);
}
window.openOccupiedCell=openOccupiedCell;

function ownerForCell(n){return capsuleOwners[Math.abs((n*7+n.toString().charCodeAt(0)))%capsuleOwners.length]}
function seededTakenCell(n){
  if(specialArchiveCells.has(n)) return false;
  const x=Math.sin(n*12.9898)*43758.5453;
  return (x-Math.floor(x)) < (START_OCCUPIED/TOTAL_CELLS);
}
const grid=document.getElementById('cellGrid');

let cellAudioCtx=null;
function ensureCellAudio(){
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx) return null;
  if(!cellAudioCtx) cellAudioCtx=new Ctx();
  if(cellAudioCtx.state==='suspended') cellAudioCtx.resume();
  return cellAudioCtx;
}
function playCellSound(kind='select'){
  const ctx=ensureCellAudio();
  if(!ctx) return;
  const now=ctx.currentTime;

  // Более солидный механический клик: короткий щелчок + глухой корпусной удар + отпускание.
  const out=ctx.createGain();
  out.gain.setValueAtTime(0.0001,now);
  out.gain.linearRampToValueAtTime(kind==='select'?0.48:0.34,now+0.004);
  out.gain.exponentialRampToValueAtTime(0.0001,now+(kind==='select'?0.145:0.115));
  out.connect(ctx.destination);

  // 1) шумовой сухой щелчок, как микрик старой мыши/клавиши.
  const len=Math.floor(ctx.sampleRate*0.045);
  const buffer=ctx.createBuffer(1,len,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<len;i++){
    const decay=Math.pow(1-i/len, kind==='select'?3.2:3.8);
    data[i]=(Math.random()*2-1)*decay;
  }
  const noise=ctx.createBufferSource();
  noise.buffer=buffer;
  const hp=ctx.createBiquadFilter();
  hp.type='bandpass';
  hp.frequency.setValueAtTime(kind==='select'?1850:1300,now);
  hp.Q.setValueAtTime(kind==='select'?1.4:1.1,now);
  const noiseGain=ctx.createGain();
  noiseGain.gain.setValueAtTime(kind==='select'?0.24:0.16,now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001,now+0.052);
  noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(out);
  noise.start(now); noise.stop(now+0.055);

  // 2) низкий корпусной «ток» — ощущение физической кнопки.
  const body=ctx.createOscillator();
  const bodyGain=ctx.createGain();
  body.type='triangle';
  body.frequency.setValueAtTime(kind==='select'?155:120,now);
  body.frequency.exponentialRampToValueAtTime(kind==='select'?82:74,now+0.075);
  bodyGain.gain.setValueAtTime(0.0001,now);
  bodyGain.gain.linearRampToValueAtTime(kind==='select'?0.26:0.19,now+0.006);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001,now+0.12);
  body.connect(bodyGain); bodyGain.connect(out);
  body.start(now); body.stop(now+0.13);

  // 3) короткий металлический пик в начале.
  const tick=ctx.createOscillator();
  const tickGain=ctx.createGain();
  tick.type='square';
  tick.frequency.setValueAtTime(kind==='select'?2450:1680,now);
  tick.frequency.exponentialRampToValueAtTime(kind==='select'?1180:760,now+0.018);
  tickGain.gain.setValueAtTime(0.0001,now);
  tickGain.gain.linearRampToValueAtTime(kind==='select'?0.16:0.10,now+0.002);
  tickGain.gain.exponentialRampToValueAtTime(0.0001,now+0.032);
  tick.connect(tickGain); tickGain.connect(out);
  tick.start(now); tick.stop(now+0.035);

  // 4) для снятия выбора — лёгкий второй «отпуск» после паузы.
  if(kind!=='select'){
    const rel=ctx.createOscillator();
    const relGain=ctx.createGain();
    rel.type='square';
    rel.frequency.setValueAtTime(620,now+0.055);
    rel.frequency.exponentialRampToValueAtTime(390,now+0.085);
    relGain.gain.setValueAtTime(0.0001,now+0.052);
    relGain.gain.linearRampToValueAtTime(0.11,now+0.058);
    relGain.gain.exponentialRampToValueAtTime(0.0001,now+0.098);
    rel.connect(relGain); relGain.connect(out);
    rel.start(now+0.052); rel.stop(now+0.105);
  }
}
function updateReserveState(){
  const quick=document.getElementById('quickReserveBtn');
  const cellInput=document.getElementById('reserveCellInput');
  const preview=document.getElementById('reservePreview');
  const submit=document.getElementById('reserveSubmitBtn');
  const notice=document.getElementById('reserveNotice');
  if(selectedArchiveCell){
    const label='#'+padCell(selectedArchiveCell);
    if(quick){quick.disabled=false;quick.classList.add('isActive');quick.textContent='Занять ячейку '+label;}
    if(cellInput) cellInput.value=label;
    if(preview) preview.textContent=`Будущий постоянный адрес капсулы:\ncapsule2007.ru/cell/${padCell(selectedArchiveCell)}\nКод владельца появится после оплаты.`;
    if(submit){submit.disabled=false;submit.textContent='Продолжить к оплате 107 ₽';}
    if(notice && !notice.textContent) notice.textContent='Ячейка выбрана. Напиши 160 символов прошлого — дальше будет переход к оплате 107 ₽.';
  }else{
    if(quick){quick.disabled=true;quick.classList.remove('isActive');quick.textContent='Выбери свободную ячейку';}
    if(cellInput) cellInput.value='Ячейка ещё не выбрана';
    if(preview) preview.textContent='Постоянный адрес капсулы появится после выбора ячейки.';
    if(submit){submit.disabled=true;submit.textContent='Сначала выбери ячейку';}
    if(notice) notice.textContent='';
  }
}
function renderArchiveCells(){
  if(!grid) return;
  grid.innerHTML='';
  const start=(currentSector-1)*SECTOR_SIZE+1;
  const end=Math.min(currentSector*SECTOR_SIZE,TOTAL_CELLS);
  const label=document.getElementById('sectorLabel');
  if(label) label.textContent=`Сектор ${String(currentSector).padStart(2,'0')} · #${padCell(start)}–#${padCell(end)}`;
  const progressText=document.getElementById('progressText');
  if(progressText){const occ=occupiedCount2007();progressText.textContent=`Занято ${occ} из ${TOTAL_CELLS}. Осталось ${TOTAL_CELLS-occ} ячеек.`;}
  const progressBar=document.getElementById('progressBar');
  if(progressBar) progressBar.style.width=`${(occupiedCount2007()/TOTAL_CELLS)*100}%`;
  renderTopCounters2007();
  for(let n=start;n<=end;n++){
    const d=document.createElement('button');
    d.type='button';
    const record=capsuleCellRecord(n);
    const taken=!!record;
    const owner=taken?record.nickname:'';
    d.className='cell '+(taken?'taken ':'')+(specialArchiveCells.has(n)?'rare ':'')+(selectedArchiveCell===n?'selected':'');
    d.dataset.cell=String(n);
    d.dataset.id=taken?`Ячейка #${padCell(n)} · ${owner}`:`#${padCell(n)} · свободна`;
    d.title=taken?`Ячейка #${padCell(n)} · владелец: ${owner}`:`Ячейка #${padCell(n)} свободна`;
    d.setAttribute('aria-label', d.title);
    d.textContent=padCell(n);
    d.addEventListener('click',()=>{
      if(taken){
        openOccupiedCell(n);
        return;
      }
      const notice=document.getElementById('reserveNotice');
      if(selectedArchiveCell===n){
        selectedArchiveCell=null;
        playCellSound('deselect');
        if(notice) notice.textContent='';
      }else{
        selectedArchiveCell=n;
        playCellSound('select');
        if(notice) notice.textContent='';
      }
      renderArchiveCells();
      updateReserveState();
    });
    grid.appendChild(d);
  }
  updateReserveState();
}
function openReserveOverlay(){
  // Подстраховка: на некоторых сборках выделение живёт в локальной переменной рендера.
  // Поэтому перед открытием модалки читаем реально выбранную соту из DOM.
  if(!selectedArchiveCell){
    const picked=document.querySelector('#cellGrid .cell.selected');
    if(picked){
      const n=Number(picked.dataset.cell || picked.textContent.replace(/\D/g,''));
      if(n) selectedArchiveCell=n;
    }
  }
  updateReserveState();

  if(!selectedArchiveCell){
    const archive=document.getElementById('archive');
    archive?.classList.add('cellPickPulse');
    setTimeout(()=>archive?.classList.remove('cellPickPulse'),1600);
    archive?.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }

  const block=document.getElementById('reserveCellBlock');
  if(block){
    block.classList.add('isOpen');
    block.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    updateReserveState();
    track2007('reserve_open',{cell:selectedArchiveCell});
    setTimeout(()=>document.getElementById('reserveMemory')?.focus(),250);
  }
}
function closeReserveOverlay(){
  const block=document.getElementById('reserveCellBlock');
  if(block){block.classList.remove('isOpen');block.setAttribute('aria-hidden','true');}
  document.body.classList.remove('modal-open');

  // Если капсула уже подготовлена, после закрытия обновляем сетку:
  // выбранная ячейка станет занятой, а кнопка “Занять” вернётся в серое состояние.
  const submitBtn=document.getElementById('reserveSubmitBtn');
  if(submitBtn && submitBtn.classList.contains('isDone')){
    selectedArchiveCell=null;
    submitBtn.classList.remove('isDone');
    if(typeof window.clearArchiveSelection==='function') window.clearArchiveSelection();
    if(typeof renderArchiveCells==='function') renderArchiveCells();
    if(typeof window.renderArchiveGridActive==='function') window.renderArchiveGridActive();
    updateReserveState();
  }
}
function openActionModal(title,text){
  const m=document.getElementById('actionModal');
  const t=document.getElementById('actionModalTitle');
  const body=document.getElementById('actionModalText');
  if(t) t.textContent=title;
  if(body) body.textContent=text;
  m?.classList.add('isOpen');
  m?.setAttribute('aria-hidden','false');
}
function closeActionModal(){
  const m=document.getElementById('actionModal');
  m?.classList.remove('isOpen');
  m?.setAttribute('aria-hidden','true');
}
// Archive controls
const prevSector=document.getElementById('prevSector');
const nextSector=document.getElementById('nextSector');
if(prevSector) prevSector.addEventListener('click',()=>{currentSector=Math.max(1,currentSector-1);renderArchiveCells();});
if(nextSector) nextSector.addEventListener('click',()=>{currentSector=Math.min(Math.ceil(TOTAL_CELLS/SECTOR_SIZE),currentSector+1);renderArchiveCells();});
const quickReserveBtn=document.getElementById('quickReserveBtn');
if(quickReserveBtn) quickReserveBtn.addEventListener('click',()=>{ if(!quickReserveBtn.disabled) openReserveOverlay(); });
const btnChooseTop=document.getElementById('btnChooseTop');
if(btnChooseTop) btnChooseTop.addEventListener('click',()=>document.getElementById('archive')?.scrollIntoView({behavior:'smooth',block:'start'}));
document.getElementById('closeReserveOverlay')?.addEventListener('click',closeReserveOverlay);
document.getElementById('reserveCellBlock')?.addEventListener('click',(e)=>{if(e.target.id==='reserveCellBlock') closeReserveOverlay();});
window.addEventListener('keydown',(e)=>{if(e.key==='Escape'){closeReserveOverlay();closeActionModal();closeMyCellModal();}});
// Reserve form
const reserveYear=document.getElementById('reserveYear');
if(reserveYear && reserveYear.options.length===0){
  for(let y=1998;y<=2009;y++){const o=document.createElement('option');o.value=y;o.textContent=y;if(y===2007)o.selected=true;reserveYear.appendChild(o)}
}
const reserveMemory=document.getElementById('reserveMemory');
if(reserveMemory) reserveMemory.addEventListener('input',()=>{const c=document.getElementById('reserveChars');if(c)c.textContent=reserveMemory.value.length});
const reserveForm=document.getElementById('reserveForm');
if(reserveForm) reserveForm.addEventListener('submit',(e)=>{
  e.preventDefault();
  const notice=document.getElementById('reserveNotice');
  if(!selectedArchiveCell){if(notice)notice.textContent='Сначала выбери свободную ячейку в архиве.';return;}
  const text=(document.getElementById('reserveMemory')?.value||'').trim();
  if(text.length<8){if(notice)notice.textContent='Сначала напиши хотя бы короткую капсулу. До 160 символов.';document.getElementById('reserveMemory')?.focus();return;}
  const nick=(document.getElementById('reserveName')?.value||'Аноним').trim()||'Аноним';
  const year=document.getElementById('reserveYear')?.value||'2007';
  const code=capsuleMakeCode();
  const item={cell:selectedArchiveCell,nickname:nick,year,text,ownerCode:code,status:'pending',createdAt:new Date().toISOString()};
  const list=capsuleSavedList().filter(x=>Number(x.cell)!==Number(selectedArchiveCell));
  list.push(item);
  capsuleSaveList(list);
  if(notice)notice.textContent=`Капсула подготовлена: #${padCell(item.cell)} · ${nick} · ${year}.\nКод владельца: ${code}\nУстановка защищённого соединения... дальше здесь будет переход к оплате 107 ₽.`;
  track2007('capsule_prepared',{cell:item.cell,year:item.year});
  const preview=document.getElementById('reservePreview');
  if(preview)preview.textContent=`Номер: #${padCell(item.cell)}\nКод владельца: ${code}\nПостоянный адрес: capsule2007.ru/cell/${padCell(item.cell)}\n\nСохрани эти данные. Без кода восстановление доступа может быть невозможно.`;

  const cellInput=document.getElementById('reserveCellInput');
  if(cellInput) cellInput.value='#'+padCell(item.cell);

  const submitBtn=document.getElementById('reserveSubmitBtn');
  if(submitBtn){
    submitBtn.disabled=true;
    submitBtn.textContent='Капсула подготовлена · данные сохранены';
    submitBtn.classList.add('isDone');
  }

  // Важно: не сбрасываем выбранную ячейку прямо внутри модалки.
  // Иначе пользователь видит “ячейка ещё не выбрана” после успешной подготовки.
  // Сетка обновится только после закрытия окна.
});
// Header buttons
const closeModalBtn=document.getElementById('actionModalClose');
if(closeModalBtn) closeModalBtn.addEventListener('click',closeActionModal);
document.getElementById('actionModal')?.addEventListener('click',(e)=>{if(e.target.id==='actionModal')closeActionModal()});
document.getElementById('btnAbout')?.addEventListener('click',()=>openActionModal('О проекте',`Capsule2007 — это цифровой архив памяти 2000-х.\n\nЗдесь не публикуют посты и не собирают лайки.\n\nЗдесь выбирают ячейку, оставляют 160 символов прошлого и получают свой номер в конечном архиве из 20 007 мест.\n\nПосле заполнения архив закроется для новых записей и останется в сети в режиме чтения.\n\nТы покупаешь не текст. Ты занимаешь место внутри цифрового артефакта эпохи.`));
document.getElementById('btnRules')?.addEventListener('click',()=>openActionModal('Правила архива',`1. Одна ячейка = одна капсула.\n\n2. До 160 символов — как старая SMS.\n\n3. Без рекламы, спама, травли, политики, персональных данных третьих лиц и запрещённого контента.\n\n4. Капсулы проходят ручную модерацию.\n\n5. До публикации текст можно поправить через “Моя ячейка”: номер + код владельца.\n\n6. После публикации капсула становится архивной записью. Менять её нельзя — можно открыть, скопировать ссылку или запросить скрытие.\n\n7. Если запись нарушает правила, администрация может скрыть её без возврата средств.`));
document.getElementById('btnLogin')?.addEventListener('click',()=>openMyCellModal());

/* === My Cell modal === */
function openMyCellModal(){
  const m=document.getElementById('myCellModal');
  if(!m)return;
  m.classList.add('isOpen');
  m.setAttribute('aria-hidden','false');
  setTimeout(()=>document.getElementById('myCellNumber')?.focus(),120);
}
function closeMyCellModal(){
  const m=document.getElementById('myCellModal');
  if(!m)return;
  m.classList.remove('isOpen');
  m.setAttribute('aria-hidden','true');
}
document.getElementById('myCellClose')?.addEventListener('click',closeMyCellModal);
document.getElementById('myCellModal')?.addEventListener('click',(e)=>{if(e.target.id==='myCellModal')closeMyCellModal()});
document.getElementById('myCellOpenBtn')?.addEventListener('click',()=>{
  const n=Number((document.getElementById('myCellNumber')?.value||'').replace(/\D/g,''));
  const code=(document.getElementById('myCellCode')?.value||'').trim().toUpperCase();
  const out=document.getElementById('myCellResult');
  if(!n || n<1 || n>20007){if(out)out.textContent='Нужен номер ячейки от 00001 до 20007.';return}
  const saved=capsuleSavedFor(n);
  if(saved && code && saved.ownerCode.toUpperCase()===code){
    if(out)out.textContent=`Доступ подтверждён.\n\nЯчейка: #${padCell(n)}\nСтатус: ${saved.status==='published'?'опубликована':'ожидает модерации'}\nВладелец: ${saved.nickname}\nГод: ${saved.year}\n\n“${saved.text}”\n\nПостоянный адрес: capsule2007.ru/cell/${padCell(n)}\n\nДо публикации здесь можно будет поправить ник, год и текст. После публикации капсула становится архивной записью.`;
    return;
  }
  const publicRecord=capsuleCellRecord(n);
  if(publicRecord){
    if(out)out.textContent=`Эта ячейка занята, но код владельца не совпал.\n\nПубличный просмотр:\n\n#${padCell(n)}\nВладелец: ${publicRecord.nickname}\nГод: ${publicRecord.year}\n\n“${publicRecord.text}”`;
  }else{
    if(out)out.textContent=`Ячейка #${padCell(n)} пока свободна. Её можно выбрать в архивной сетке.`;
  }
});

// Living QIP dialogue
const qipMessages=document.getElementById('qipMessages');
const qipTyping=document.getElementById('qipTyping');
const qipScript=[
  {n:'Костя', t:'ну вы где? на серве никого', c:'k', time:'00:32', pause:900},
  {n:'Данил', t:'ща буду, комп грузится просто', c:'d', time:'00:32', pause:1200},
  {n:'Лена', t:'привет всем :)', c:'l', time:'00:33', pause:1500},
  {n:'Игорь', t:'я тут, музыку заливаю', c:'i', time:'00:34', pause:1700},
  {n:'Костя', t:'го дм на дасте?', c:'k', time:'00:36', pause:2100},
  {n:'Данил', t:'давайте', c:'d', time:'00:36', pause:1100},
  {n:'Лена', t:'я за, только 5 мин и я с вами', c:'l', time:'00:38', pause:1600},
  {n:'Игорь', t:'ок, жду в спектрах', c:'i', time:'00:39', pause:2200}
];
let qIdx=0, qTyped='', qDone=[];
function qClass(c){return c==='d'?'d':c==='l'?'l':c==='i'?'i':''}
function qRender(){
  if(!qipMessages || !qipTyping) return;
  let html='';
  const visible=qDone.slice(-6);
  visible.forEach(m=>{html+=`<p class="msg ${qClass(m.c)}"><span class="time">${m.time}</span><b>${m.n}:</b><br>${m.t}</p>`});
  if(qIdx<qipScript.length){
    const m=qipScript[qIdx];
    html+=`<p class="msg ${qClass(m.c)}"><span class="time">...</span><b>${m.n}:</b><br>${qTyped}<span style="animation:blink 1s steps(1) infinite">▌</span></p>`;
    qipTyping.textContent=m.n+' печатает...';
  }else{
    qipTyping.textContent='ожидание ответа...';
  }
  qipMessages.innerHTML=html;
}
function qTick(){
  if(!qipMessages || !qipTyping) return;
  if(qIdx>=qipScript.length){setTimeout(()=>{qIdx=0;qTyped='';qDone=[];qRender();qTick()},4200);return;}
  const m=qipScript[qIdx];
  if(qTyped.length<m.t.length){
    qTyped=m.t.slice(0,qTyped.length+1);qRender();
    setTimeout(qTick,48+Math.random()*70+(qTyped.length%6===0?110:0));
  }else{
    setTimeout(()=>{qDone.push(m); if(window.playIcqIncomingMessage) window.playIcqIncomingMessage(); qIdx++; qTyped=''; qRender(); qTick();},m.pause);
  }
}

// Interactive Winamp: clickable playlist, current-track marquee, play/pause/stop/seek.
const winampTracks=[
  {title:'Linkin Park - In The End', duration:216},
  {title:'The Prodigy - Smack My Bitch Up', duration:343},
  {title:'Король и Шут - Лесник', duration:191},
  {title:'Limp Bizkit - Break Stuff', duration:166},
  {title:'50 Cent - In Da Club', duration:193},
  {title:'Evanescence - My Immortal', duration:262},
  {title:'The Rasmus - In The Shadows', duration:258},
  {title:'t.A.T.u. - Нас не догонят', duration:274}
];
let winampIndex=0, winampSecond=0, winampPlaying=true;
function winFmt(sec){sec=Math.max(0,Math.floor(sec));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function winampButtonClick(){try{playCellSound('select')}catch(e){}}
function renderWinamp(){
  const box=document.getElementById('winampBox'), track=winampTracks[winampIndex];
  if(!box||!track)return;
  const status=document.getElementById('winampStatus'), marquee=document.getElementById('winampMarquee'), time=document.getElementById('winampTime'), seek=document.getElementById('winampSeekBar'), list=document.getElementById('winampPlaylist');
  box.classList.toggle('isPaused',!winampPlaying && winampSecond>0);
  box.classList.toggle('isStopped',!winampPlaying && winampSecond===0);
  if(status)status.textContent=winampPlaying?'PLAY':(winampSecond===0?'STOP':'PAUSE');
  if(marquee)marquee.textContent='♪ '+track.title+' · 128 kbps · 44 kHz · stereo';
  if(time)time.textContent=winFmt(winampSecond)+' / '+winFmt(track.duration);
  if(seek)seek.style.width=(Math.min(100,(winampSecond/track.duration)*100)||0)+'%';
  if(list){list.innerHTML=winampTracks.map((t,i)=>`<div class="${i===winampIndex?'active':''}" data-track="${i}">${String(i+1).padStart(2,'0')}. ${t.title} <span style="float:right;color:#718b7f">${winFmt(t.duration)}</span></div>`).join('');}
}
function setWinampTrack(i){winampIndex=(i+winampTracks.length)%winampTracks.length;winampSecond=0;winampPlaying=true;winampButtonClick();renderWinamp()}
function initInteractiveWinamp(){
  renderWinamp();
  document.getElementById('winampPlaylist')?.addEventListener('click',e=>{const row=e.target.closest('[data-track]');if(row)setWinampTrack(Number(row.dataset.track));});
  document.getElementById('winPrev')?.addEventListener('click',()=>setWinampTrack(winampIndex-1));
  document.getElementById('winNext')?.addEventListener('click',()=>setWinampTrack(winampIndex+1));
  document.getElementById('winPlay')?.addEventListener('click',()=>{winampPlaying=true;winampButtonClick();renderWinamp();});
  document.getElementById('winPause')?.addEventListener('click',()=>{winampPlaying=false;winampButtonClick();renderWinamp();});
  document.getElementById('winStop')?.addEventListener('click',()=>{winampPlaying=false;winampSecond=0;winampButtonClick();renderWinamp();});
  document.getElementById('winampSeek')?.addEventListener('click',e=>{const track=winampTracks[winampIndex],r=e.currentTarget.getBoundingClientRect();winampSecond=Math.max(0,Math.min(track.duration,((e.clientX-r.left)/r.width)*track.duration));winampButtonClick();renderWinamp();});
  setInterval(()=>{if(!winampPlaying)return;const track=winampTracks[winampIndex];winampSecond+=1;if(winampSecond>=track.duration){winampIndex=(winampIndex+1)%winampTracks.length;winampSecond=0;}renderWinamp();},1000);
}

initInteractiveWinamp();
renderArchiveCells();
renderTopCounters2007();
qRender();
qTick();

(function(){
  const TOTAL=20007;
  const DESKTOP_SIZE=500;
  const MOBILE_SIZE=80;
  let sector=1;
  let selected=null;
  const special=new Set([7,107,777,1337,2007,7777,11111,12345,16000,20007]);
  const owners=['Костя','Данил','Лена','Игорь','Макс','Света','Жека','Юля','Вова','Настя','Рома','Ира','Дима','Катя'];
  function size(){return window.matchMedia('(max-width:760px)').matches?MOBILE_SIZE:DESKTOP_SIZE;}
  function pad(n){return String(n).padStart(5,'0');}
  function taken(n){
    if(window.capsuleSavedFor && window.capsuleSavedFor(n)) return true;
    if(special.has(n)) return false;
    const x=Math.sin(n*12.9898)*43758.5453;
    return (x-Math.floor(x)) < (2317/TOTAL);
  }
  function owner(n){const s=window.capsuleSavedFor?window.capsuleSavedFor(n):null; return s?s.nickname:owners[Math.abs((n*7+n.toString().charCodeAt(0)))%owners.length];}
  function syncReserve(){
    selectedArchiveCell=selected;
    if(typeof updateReserveState==='function') updateReserveState();
    const b=document.getElementById('quickReserveBtn');
    const inp=document.getElementById('reserveCellInput');
    const prev=document.getElementById('reservePreview');
    const submit=document.getElementById('reserveSubmitBtn');
    if(selected){
      const label='#'+pad(selected);
      if(b){b.disabled=false;b.classList.add('isActive');b.textContent='Занять ячейку '+label;}
      if(inp) inp.value=label;
      if(prev) prev.textContent='Выбрана ячейка: #'+pad(selected)+'\nПосле оплаты: постоянный адрес капсулы, код владельца и статус в архиве.';
      if(submit){submit.disabled=false;submit.textContent='Продолжить к оплате 107 ₽';}
    }else{
      if(b){b.disabled=true;b.classList.remove('isActive');b.textContent='Выбери свободную ячейку';}
      if(inp) inp.value='Ячейка ещё не выбрана';
      if(prev) prev.textContent='Постоянный адрес капсулы появится после выбора ячейки.';
      if(submit){submit.disabled=true;submit.textContent='Сначала выбери ячейку';}
    }
  }
  function clickSound(kind){try{ if(typeof playCellSound==='function') playCellSound(kind); }catch(e){}}
  function render(){
    const grid=document.getElementById('cellGrid');
    if(!grid) return;
    grid.innerHTML='';
    const per=size();
    const maxSector=Math.ceil(TOTAL/per);
    if(sector>maxSector) sector=maxSector;
    const start=(sector-1)*per+1;
    const end=Math.min(sector*per,TOTAL);
    const label=document.getElementById('sectorLabel');
    if(label) label.textContent='Сектор '+String(sector).padStart(2,'0')+' · #'+pad(start)+'–#'+pad(end);
    const progress=document.getElementById('progressText');
    if(progress){const occ=occupiedCount2007();progress.textContent='Занято '+occ+' из 20007. Осталось '+(20007-occ)+' ячеек.';}
    const bar=document.getElementById('progressBar');
    if(bar) bar.style.width=(occupiedCount2007()/TOTAL*100)+'%';
    renderTopCounters2007();
    for(let n=start;n<=end;n++){
      const isTaken=taken(n);
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='cell '+(isTaken?'taken ':'')+(special.has(n)?'rare ':'')+(selected===n?'selected':'');
      btn.textContent=pad(n);
      btn.dataset.n=String(n);
      btn.dataset.taken=isTaken?'1':'0';
      btn.dataset.id=isTaken?'Ячейка #'+pad(n)+' · '+owner(n):'#'+pad(n)+' · свободна';
      btn.title=isTaken?'Ячейка #'+pad(n)+' · владелец: '+owner(n):'Ячейка #'+pad(n)+' свободна';
      grid.appendChild(btn);
    }
    syncReserve();
  }
  function onCellPress(e){
    const cell=e.target.closest('#cellGrid .cell');
    if(!cell) return;
    e.preventDefault();
    const n=Number(cell.dataset.n||0);
    if(!n) return;
    if(cell.dataset.taken==='1'){
      track2007('occupied_cell_open',{cell:n});
      if(window.openOccupiedCell) window.openOccupiedCell(n);
      return;
    }
    if(selected===n){selected=null;clickSound('deselect');track2007('cell_deselected',{cell:n});}
    else{selected=n;clickSound('select');track2007('cell_selected',{cell:n});}
    render();
  }
  function openForm(){
    if(!selected){
      const a=document.getElementById('archive');
      if(a){a.classList.add('cellPickPulse');setTimeout(()=>a.classList.remove('cellPickPulse'),1000)}
      return;
    }
    if(typeof openReserveOverlay==='function') openReserveOverlay();
    else{
      const modal=document.getElementById('reserveCellBlock');
      if(modal){modal.classList.add('isOpen');document.body.classList.add('modal-open');}
    }
  }
  function boot(){
    const grid=document.getElementById('cellGrid');
    if(!grid) return;
    grid.addEventListener('click',onCellPress,true);
    grid.addEventListener('touchend',onCellPress,{passive:false,capture:true});
    document.getElementById('prevSector')?.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();sector=Math.max(1,sector-1);render();},true);
    document.getElementById('nextSector')?.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();sector=Math.min(Math.ceil(TOTAL/size()),sector+1);render();},true);
    document.getElementById('quickReserveBtn')?.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();openForm();},true);
    window.addEventListener('resize',render);
    window.renderArchiveGridActive=render;
    window.clearArchiveSelection=function(){selected=null;selectedArchiveCell=null;syncReserve();render();};
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();

/* Capsule2007 separated assets audio layer: background nostalgia + ICQ + cell drawer */
(function(){
  const bg = new Audio('assets/audio/bg-nostalgia.mp3');
  bg.loop = true;
  bg.volume = 0.56;
  const icq = new Audio('assets/audio/icq-message.mp3');
  icq.volume = 0.045;
  const cellOpen = new Audio('assets/audio/cell-open.mp3');
  cellOpen.volume = 0.78;
  const cellClose = new Audio('assets/audio/cell-close.mp3');
  cellClose.volume = 0.72;

  let soundUnlocked = false;
  const SOUND_COOLDOWN_MS = { icq: 1200, cellOpen: 120, cellClose: 120 };
  const lastPlayedAt = new Map();

  function playManaged(soundName){
    if(!soundUnlocked) return;
    const src = soundName === 'icq' ? icq : (soundName === 'cellClose' ? cellClose : cellOpen);
    const now = Date.now();
    const minGap = SOUND_COOLDOWN_MS[soundName] || 0;
    if(now - (lastPlayedAt.get(soundName) || 0) < minGap) return;
    lastPlayedAt.set(soundName, now);
    try {
      src.pause();
      src.currentTime = 0;
      src.play().catch(()=>{});
    } catch(e) {}
  }

  window.playIcqIncomingMessage = function(){
    playManaged('icq');
  };

  const originalPlayCellSound = (typeof window.playCellSound === 'function') ? window.playCellSound : null;
  window.playCellSound = function(kind='select'){
    const target = kind === 'deselect' ? 'cellClose' : 'cellOpen';
    playManaged(target);
    if(!soundUnlocked || !originalPlayCellSound) return;
    try { originalPlayCellSound(kind); } catch(e) {}
  };

  function unlockSound(){
    if(soundUnlocked) return;
    soundUnlocked = true;
    const ctx = ensureCellAudio();
    if(ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
    [bg, icq, cellOpen, cellClose].forEach((audio)=>{
      try {
        audio.load();
        audio.pause();
        audio.currentTime = 0;
      } catch(e) {}
    });
    bg.play().catch(()=>{});
    document.getElementById('soundUnlock2007')?.classList.add('hidden');
    const gateEl = document.getElementById('bootGate2007');
    if(gateEl){ gateEl.classList.add('isHidden'); gateEl.setAttribute('aria-hidden','true'); }
    track2007('sound_unlocked');
  }

  document.getElementById('bootEnter2007')?.addEventListener('click', unlockSound);
  document.getElementById('bootGate2007')?.addEventListener('click', unlockSound);
  window.addEventListener('pointerdown', unlockSound, {once:true, passive:true});
  window.addEventListener('click', unlockSound, {once:true});
  document.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' ' || e.code === 'Space') unlockSound();
  });
})();