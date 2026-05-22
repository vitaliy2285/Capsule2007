/*
  Capsule2007 V5 Production Bridge
  --------------------------------
  Этот файл НЕ ломает “СИЛЬНО”, а аккуратно перехватывает критичные действия:
  1) заявка создаётся только как pending_payment;
  2) ячейка НЕ становится занятой до webhook успешной оплаты;
  3) фронтенд никогда не решает сам, оплачено или нет;
  4) “Моя ячейка” проверяется через backend.
*/

(function(){
  // Старые демо-записи localStorage не должны влиять на production-логику.
  try { localStorage.removeItem('capsule2007_owned_cells'); } catch(e) {}

  const API_ORIGIN = 'https://capsule2007.vercel.app';

  const API = {
    createPayment: API_ORIGIN + '/api/create-payment',
    checkPayment: API_ORIGIN + '/api/check-payment',
    myCell: API_ORIGIN + '/api/my-cell',
    listCells: API_ORIGIN + '/api/list-cells',
    getCell: API_ORIGIN + '/api/get-cell',
    yookassaWebhook: API_ORIGIN + '/api/yookassa-webhook'
  };

  const state = {
    remoteCells: new Map(),
    remoteStats: null,
    lastSectorLoaded: null,
    lastPending: null,
    syncRevision: 0
  };

  // Полностью отключаем демо-публикацию из localStorage для production/test-стенда.
  window.capsuleSavedFor = function(){ return null; };
  window.capsuleSavedList = function(){ return []; };

  function emit(name, payload){
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({event:name, ...payload});
      console.log('[Capsule2007]', name, payload || {});
    } catch(e){}
  }

  function getSelectedCellNumber(){
    if(window.selectedArchiveCell) return Number(window.selectedArchiveCell);
    const picked = document.querySelector('#cellGrid .cell.selected');
    if(picked){
      const n = Number(picked.dataset.cell || picked.dataset.n || picked.textContent.replace(/\D/g,''));
      if(n) return n;
    }
    const txt = (document.getElementById('reserveCellInput')?.value || '').replace(/\D/g,'');
    if(txt) return Number(txt);
    return 0;
  }

  function pad(n){ return String(n).padStart(5,'0'); }

  function cellNumberOf(raw){
    const n = Number(raw?.cell_number ?? raw?.cell ?? raw?.number);
    return Number.isFinite(n) ? n : 0;
  }

  function remoteOwnerName(raw){
    return String(raw?.nickname || raw?.owner_nickname || 'Аноним').trim() || 'Аноним';
  }

  function cacheBustedUrl(url){
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_sync=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function ownerCodeStorageKey(reservationId){
    return `capsule2007_owner_code_${String(reservationId || '')}`;
  }

  function saveOwnerCode(reservationId, ownerCode){
    if(!reservationId || !ownerCode) return;
    const key = ownerCodeStorageKey(reservationId);
    try { sessionStorage.setItem(key, ownerCode); } catch(e) {}
    try { localStorage.setItem(key, ownerCode); } catch(e) {}
  }

  function getOwnerCode(reservationId){
    if(!reservationId) return '';
    const key = ownerCodeStorageKey(reservationId);
    let code = '';
    try { code = sessionStorage.getItem(key) || ''; } catch(e) {}
    if(!code){
      try { code = localStorage.getItem(key) || ''; } catch(e) {}
    }
    return String(code || '');
  }

  function installHiddenCellVisualFix(){
    if(document.getElementById('capsule2007HiddenCellSyncFix')) return;
    const style = document.createElement('style');
    style.id = 'capsule2007HiddenCellSyncFix';
    style.textContent = `
      #cellGrid .cell.hidden-cell{
        background:radial-gradient(circle,rgba(156,255,79,.16),rgba(43,126,54,.08) 58%,rgba(2,6,17,.72))!important;
        color:rgba(220,255,205,.74)!important;
        border-color:rgba(156,255,79,.30)!important;
        box-shadow:0 0 10px rgba(156,255,79,.10),inset 0 0 12px rgba(156,255,79,.06)!important;
        opacity:.82!important;
        text-indent:0!important;
      }
      #cellGrid .cell.hidden-cell::before{
        content:none!important;
        display:none!important;
      }
      #cellGrid .cell.hidden-cell::after{
        content:none!important;
        display:none!important;
      }
      #cellGrid .cell.hidden-cell:hover::after{
        content:attr(data-id)!important;
        display:block!important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyRemoteCellsToDom(){
    installHiddenCellVisualFix();

    const nodes = document.querySelectorAll('#cellGrid .cell[data-cell], #cellGrid .cell[data-n]');

    nodes.forEach((node)=>{
      const cellNumber = Number(node.dataset.cell || node.dataset.n || 0);
      if(!cellNumber) return;

      const remote = state.remoteCells.get(cellNumber);
      const status = String(remote?.status || '');
      const isRejected = status === 'rejected';
      const isTaken = !!remote && !isRejected;
      const isHidden = isTaken && status === 'hidden';
      const isPendingModeration = isTaken && status === 'paid_pending_moderation';

      node.textContent = pad(cellNumber);
      node.classList.toggle('taken', isTaken);
      node.classList.toggle('hidden-cell', isHidden);
      node.dataset.status = isTaken ? status : 'free';

      if(isTaken){
        node.classList.remove('selected');
        const owner = remoteOwnerName(remote);
        const label = isHidden
          ? `Ячейка #${pad(cellNumber)} · скрытая капсула Capsule2007 · владелец: ${owner}`
          : (isPendingModeration
            ? `Ячейка #${pad(cellNumber)} · капсула ожидает модерации · владелец: ${owner}`
            : `Ячейка #${pad(cellNumber)} · владелец: ${owner}`);
        node.title = label;
        node.setAttribute('aria-label', label);
        node.dataset.id = `Ячейка #${pad(cellNumber)} · ${owner}`;
        node.dataset.taken = '1';
        node.setAttribute('aria-disabled', 'true');
      }else{
        node.dataset.id = `#${pad(cellNumber)} · свободна`;
        node.title = `Ячейка #${pad(cellNumber)} свободна`;
        node.setAttribute('aria-label', node.title);
        node.dataset.taken = '0';
        node.classList.remove('taken', 'hidden-cell');
        node.removeAttribute('aria-disabled');
      }
    });

    const selectedCell = getSelectedCellNumber();
    if(selectedCell){
      const selectedRemote = state.remoteCells.get(selectedCell);
      const selectedStatus = String(selectedRemote?.status || '');
      if(selectedRemote && selectedStatus !== 'rejected'){
      window.selectedArchiveCell = null;
      const selectedNode = document.querySelector('#cellGrid .cell.selected');
      if(selectedNode) selectedNode.classList.remove('selected');

      const submit = document.getElementById('reserveSubmitBtn');
      if(submit){
        submit.disabled = true;
        submit.textContent = 'Сначала выбери ячейку';
      }

      if(typeof window.clearArchiveSelection === 'function'){
        window.clearArchiveSelection();
      }else if(typeof window.updateReserveState === 'function'){
        window.updateReserveState();
      }
      }
    }
  }



  function applyReserveStatusForTakenCell(cellNumber, status){
    const notice = document.getElementById('reserveNotice');
    const preview = document.getElementById('reservePreview');
    const submit = document.getElementById('reserveSubmitBtn');

    if(status === 'paid_pending_moderation'){
      if(notice) notice.textContent = `Ячейка #${pad(cellNumber)} оплачена и ожидает модерации.`;
      if(preview) preview.textContent = 'Капсула оплачена и отправлена на модерацию.\nПосле одобрения она появится в архиве.\nПовторная покупка этой ячейки невозможна.';
      if(submit){
        submit.disabled = true;
        submit.textContent = 'Ожидает модерации';
      }
      return true;
    }

    if(status === 'hidden'){
      if(notice) notice.textContent = 'Капсула скрыта администратором.';
      if(preview) preview.textContent = 'Эта ячейка недоступна для повторной покупки.';
      if(submit){
        submit.disabled = true;
        submit.textContent = 'Недоступно';
      }
      return true;
    }

    if(status === 'published'){
      if(notice) notice.textContent = 'Капсула опубликована.';
      if(preview) preview.textContent = 'Эта ячейка уже опубликована и недоступна для повторной покупки.';
      if(submit){
        submit.disabled = true;
        submit.textContent = 'Опубликовано';
      }
      return true;
    }

    return false;
  }

  const oldUpdateReserveState = window.updateReserveState;
  if(typeof oldUpdateReserveState === 'function'){
    window.updateReserveState = function(){
      oldUpdateReserveState();

      const selectedCell = getSelectedCellNumber();
      if(!selectedCell) return;

      const remote = state.remoteCells.get(selectedCell);
      const status = String(remote?.status || '');
      if(!remote || status === 'rejected') return;

      applyReserveStatusForTakenCell(selectedCell, status);
    };
  }
  async function apiFetch(url, options = {}){
    const res = await fetch(url, {
      ...options,
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'Cache-Control':'no-cache, no-store, max-age=0',
        'Pragma':'no-cache',
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.error){
      const msg = data.error || ('HTTP '+res.status);
      throw new Error(msg);
    }
    return data;
  }

  // Подгрузка реальных занятых ячеек сектора из базы.
  async function loadSectorFromBackend(options = {}){
    const force = !!options.force;
    const label = document.getElementById('sectorLabel')?.textContent || '';
    const rangeMatch = label.match(/#(\d+)\D+#(\d+)/);
    const visibleStart = rangeMatch ? Number(rangeMatch[1]) : 1;
    const sector = Math.max(1, Math.floor((visibleStart - 1) / 500) + 1);
    if(!force && state.lastSectorLoaded === sector) return;

    const syncRevision = ++state.syncRevision;

    try{
      const data = await apiFetch(cacheBustedUrl(`${API.listCells}?sector=${sector}`), {method:'GET'});

      if(syncRevision !== state.syncRevision) return;

      const cells = Array.isArray(data.cells)
        ? data.cells
        : (Array.isArray(data.data) ? data.data : []);

      state.remoteCells.clear();

      for (const c of cells) {
        const cellNumber = cellNumberOf(c);
        if (!cellNumber) continue;
        state.remoteCells.set(cellNumber, c);
      }

      state.remoteStats = {
        occupied_total: Number(data.occupied_total || 0),
        free_total: Number(data.free_total || 0)
      };

      window.__capsuleRemoteStats = state.remoteStats;
      window.__capsuleRemoteTaken = new Set(
        cells
          .map(cellNumberOf)
          .filter(Boolean)
      );

      state.lastSectorLoaded = sector;
      emit('sector_loaded', {sector, count:state.remoteCells.size});

      if(typeof renderArchiveCells === 'function') renderArchiveCells();
      applyRemoteCellsToDom();

      if(typeof window.renderArchiveGridActive === 'function') window.renderArchiveGridActive();
      applyRemoteCellsToDom();
    }catch(e){
      console.warn('Backend sector load skipped:', e.message);
      // На демо/локально сайт продолжает жить на визуальном фейковом заполнении.
    }
  }

  // Переопределяем публичную запись ячейки: база важнее демо.
  const oldCapsuleCellRecord = window.capsuleCellRecord;
  window.capsuleCellRecord = function(n){
    const remote = state.remoteCells.get(Number(n));
    if(remote){
      return {
        cell:Number(remote.cell_number),
        nickname:remote.nickname || 'Аноним',
        year:remote.memory_year || '2007',
        text:(remote.status === 'published')
          ? (remote.message || '')
          : (remote.status === 'hidden'
            ? ''
            : 'Капсула ожидает модерации'),
        status:remote.status || 'published',
        local:false
      };
    }
    return oldCapsuleCellRecord ? oldCapsuleCellRecord(n) : null;
  };

  // Открытие занятой ячейки через backend, если возможно.
  const oldOpenOccupiedCell = window.openOccupiedCell;
  window.openOccupiedCell = async function(n){
    emit('cell_occupied_open', {cell_number:n});
    try{
      const data = await apiFetch(cacheBustedUrl(`${API.getCell}?cell=${Number(n)}`), {method:'GET'});
      if(data.cell){
        const c = data.cell;
        openActionModal(
          'Ячейка #'+pad(c.cell_number),
          `Статус: ${(c.is_seed === true || c.source === 'foundation')
            ? 'капсула основания Capsule2007'
            : (c.status === 'published'
              ? 'опубликована'
              : (c.status === 'hidden' ? 'скрыта' : 'ожидает модерации'))}\n`+
          `Владелец: ${c.nickname || 'Аноним'}\n`+
          `${c.status === 'published' ? `Год: ${c.memory_year || '2007'}\n\n“${c.message || ''}”\n\nПостоянный адрес капсулы:\n${location.origin}/cell/${pad(c.cell_number)}` : ''}`+
          `${c.status === 'paid_pending_moderation' ? 'Капсула ожидает модерации.' : ''}`+
          `${c.status === 'hidden' ? 'Текст этой капсулы скрыт.' : ''}`
        );
        return;
      }
    }catch(e){}
    if(oldOpenOccupiedCell) oldOpenOccupiedCell(n);
  };

  // КРИТИЧНО: перехватываем submit формы в capture-фазе, чтобы старый demo-localStorage не успел записать ячейку как занятую.
  document.addEventListener('submit', async function(e){
    if(e.target && e.target.id === 'reserveForm'){
      e.preventDefault();
      e.stopImmediatePropagation();

      const cellNumber = getSelectedCellNumber();
      const nickname = (document.getElementById('reserveName')?.value || 'Аноним').trim() || 'Аноним';
      const year = document.getElementById('reserveYear')?.value || '2007';
      const message = (document.getElementById('reserveMemory')?.value || '').trim();
      const notice = document.getElementById('reserveNotice');
      const preview = document.getElementById('reservePreview');
      const submit = document.getElementById('reserveSubmitBtn');

      if(!cellNumber){
        if(notice) notice.textContent = 'Сначала выбери свободную ячейку в архиве.';
        document.getElementById('archive')?.scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
      const selectedRemote = state.remoteCells.get(cellNumber);
      const selectedStatus = String(selectedRemote?.status || '');
      if(selectedRemote && selectedStatus !== 'rejected'){
        applyReserveStatusForTakenCell(cellNumber, selectedStatus);
        applyRemoteCellsToDom();
        return;
      }
      if(message.length < 8){
        if(notice) notice.textContent = 'Сначала напиши хотя бы короткую капсулу. До 160 символов.';
        document.getElementById('reserveMemory')?.focus();
        return;
      }
      if(message.length > 160){
        if(notice) notice.textContent = 'Капсула должна быть до 160 символов.';
        return;
      }

      emit('payment_click', {cell_number:cellNumber, chars:message.length});

      if(submit){
        submit.disabled = true;
        submit.textContent = 'Создаём заявку на оплату...';
      }
      if(notice) notice.textContent = 'Ячейка ещё не занята. Создаём заявку pending_payment.';

      try{
        const data = await apiFetch(API.createPayment, {
          method:'POST',
          body:JSON.stringify({
            cell_number:cellNumber,
            nickname,
            memory_year:year,
            message
          })
        });

        state.lastPending = data;
        saveOwnerCode(data.reservation_id || data.payment_check, data.owner_code);

        if(preview){
          preview.textContent =
            `Ячейка #${pad(cellNumber)} подготовлена.\n`+
            `Статус: pending_payment\n`+
            `До оплаты она НЕ отображается как занятая.\n\n`+
            `После успешной оплаты появятся:\n`+
            `— код владельца;\n— постоянный адрес капсулы;\n— статус модерации.`;
        }

        if(data.payment_url){
          if(notice) notice.textContent = 'Переход к оплате 107 ₽. После оплаты ячейка уйдёт на модерацию.';
          if(submit) submit.textContent = 'Переходим к оплате...';
          setTimeout(()=>{ location.href = data.payment_url; }, 650);
        }else{
          // Без ключей платёжки — безопасный демо-режим. Ничего не публикуем.
          if(notice) notice.textContent = 'Заявка создана, но платёжка не настроена. Ячейка НЕ занята.';
          if(submit){
            submit.disabled = false;
            submit.textContent = 'Платёжка не настроена · демо';
          }
        }

      }catch(err){
        const raw = String(err.message || err);
        const friendly = (raw.includes('Missing env') || raw.includes('backend_offline') || raw.includes('HTTP 404') || raw.includes('SUPABASE'))
          ? 'Платёжная система пока не подключена. Это тестовый режим: ячейка не занята и не опубликована.'
          : ('Ошибка: ' + raw);
        if(notice) notice.textContent = friendly;
        if(preview){
          preview.textContent =
            `Ячейка #${pad(cellNumber)} подготовлена как черновик.\n`+
            `Но без backend/webhook она НЕ может стать занятой.\n\n`+
            `Для релиза подключаем Supabase + ЮKassa.`;
        }
        if(submit){
          submit.disabled = false;
          submit.textContent = 'Оплата пока не подключена';
        }
      }
    }
  }, true);

  // “Моя ячейка” — через backend. Если backend не настроен, старый демо-ответ останется fallback.
  document.addEventListener('click', async function(e){
    if(e.target && e.target.id === 'myCellOpenBtn'){
      e.preventDefault();
      e.stopImmediatePropagation();

      const n = Number((document.getElementById('myCellNumber')?.value || '').replace(/\D/g,''));
      const code = (document.getElementById('myCellCode')?.value || '').trim().toUpperCase();
      const out = document.getElementById('myCellResult');

      if(!n || n < 1 || n > 20007){
        if(out) out.textContent='Нужен номер ячейки от 00001 до 20007.';
        return;
      }
      if(!code){
        if(out) out.textContent='Введи код владельца.';
        return;
      }

      emit('my_cell_open', {cell_number:n});

      try{
        const data = await apiFetch(API.myCell, {
          method:'POST',
          body:JSON.stringify({cell_number:n, owner_code:code})
        });
        const c = data.cell;
        if(out){
          out.textContent =
            `Доступ подтверждён.\n\n`+
            `Ячейка: #${pad(c.cell_number)}\n`+
            `Статус: ${c.status}\n`+
            `Владелец: ${c.nickname || 'Аноним'}\n`+
            `Год: ${c.memory_year || '2007'}\n\n`+
            `“${c.message || ''}”\n\n`+
            `Постоянный адрес:\n${location.origin}/cell/${pad(c.cell_number)}\n\n`+
            `Редактирование доступно только до публикации / в пределах окна модерации.`;
        }
      }catch(err){
        if(out) out.textContent = 'Ошибка доступа: '+err.message;
      }
    }
  }, true);

  // Занятые backend-ячейки открываются только на просмотр и не выбираются повторно.
  document.addEventListener('click', function(e){
    const cell = e.target && e.target.closest ? e.target.closest('#cellGrid .cell[data-cell], #cellGrid .cell[data-n]') : null;
    if(!cell) return;

    const n = Number(cell.dataset.cell || cell.dataset.n || 0);
    if(!n) return;

    const remote = state.remoteCells.get(n);
    const status = String(remote?.status || '');
    if(remote && status !== 'rejected'){
      e.preventDefault();
      e.stopImmediatePropagation();
      cell.classList.remove('selected');
      window.selectedArchiveCell = null;
      if(typeof window.clearArchiveSelection === 'function'){
        window.clearArchiveSelection();
      }else if(typeof window.updateReserveState === 'function'){
        window.updateReserveState();
      }
      window.openOccupiedCell(n);
    }
  }, true);

  // После переключения сектора пробуем подтянуть backend в capture-фазе,
  // потому что активная сетка в app.js перехватывает кнопки через stopImmediatePropagation().
  document.addEventListener('click', function(e){
    if(e.target && (e.target.id === 'prevSector' || e.target.id === 'nextSector')){
      state.lastSectorLoaded = null;
      setTimeout(()=>loadSectorFromBackend({force:true}), 250);
      setTimeout(applyRemoteCellsToDom, 500);
    }
  }, true);

  window.addEventListener('load', ()=>{
    installHiddenCellVisualFix();
    setTimeout(()=>loadSectorFromBackend({force:true}), 600);
    handlePaymentReturn();
  });

  

  async function handlePaymentReturn(){
    const q = new URLSearchParams(location.search);
    const reservation = q.get('payment_check') || q.get('reservation_id');
    const claim = q.get('claim') || q.get('claim_token');
    if(!reservation || !claim) return;
    try{
      const data = await apiFetch(cacheBustedUrl(API.checkPayment + `?reservation_id=${encodeURIComponent(reservation)}&claim=${encodeURIComponent(claim)}`), {method:'GET'});
      if(data.paid && data.cell){
        const c = data.cell;
        const ownerCode = getOwnerCode(data.reservation_id || data.payment_check || reservation);
        const ownerCodeText = ownerCode
          ? `Код владельца: ${ownerCode}\n`
          : `Код владельца был показан при создании заявки. Если вы его потеряли, восстановление пока невозможно.\n`;
        openActionModal('Капсула оплачена и ожидает модерации', `Ячейка: #${pad(c.cell_number)}\n${ownerCodeText}Статус: ${c.status}\nПостоянный адрес: ${location.origin}${c.link}\n\nСохрани код владельца.`);
      }
    }catch(e){ console.warn('payment check failed', e.message); }
  }

  window.Capsule2007V5 = { loadSectorFromBackend, state, applyRemoteCellsToDom };
})();
