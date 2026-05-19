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

  const API = {
    createPayment: '/api/create-payment',
    checkPayment: '/api/check-payment',
    myCell: '/api/my-cell',
    listCells: '/api/list-cells',
    getCell: '/api/get-cell',
    yookassaWebhook: '/api/yookassa-webhook'
  };

  const state = {
    remoteCells: new Map(),
    remoteStats: null,
    lastSectorLoaded: null,
    lastPending: null
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
      const n = Number(picked.dataset.cell || picked.textContent.replace(/\D/g,''));
      if(n) return n;
    }
    const txt = (document.getElementById('reserveCellInput')?.value || '').replace(/\D/g,'');
    if(txt) return Number(txt);
    return 0;
  }

  function pad(n){ return String(n).padStart(5,'0'); }

  async function apiFetch(url, options){
    const res = await fetch(url, {
      headers:{'Content-Type':'application/json'},
      ...options
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.error){
      const msg = data.error || ('HTTP '+res.status);
      throw new Error(msg);
    }
    return data;
  }

  // Подгрузка реальных занятых ячеек сектора из базы.
  async function loadSectorFromBackend(){
    const label = document.getElementById('sectorLabel')?.textContent || '';
    const sectorMatch = label.match(/Сектор\s+(\d+)/i);
    const sector = sectorMatch ? Number(sectorMatch[1]) : 1;
    if(state.lastSectorLoaded === sector) return;

    try{
      const data = await apiFetch(`${API.listCells}?sector=${sector}`, {method:'GET'});
      state.remoteCells.clear();
      for(const c of data.cells || []){
        state.remoteCells.set(Number(c.cell_number), c);
      }
      state.remoteStats = {occupied_total:Number(data.occupied_total||0), free_total:Number(data.free_total||0)};
      window.__capsuleRemoteStats = state.remoteStats;
      window.__capsuleRemoteTaken = new Set((data.cells||[]).map(c=>Number(c.cell_number)));
      state.lastSectorLoaded = sector;
      emit('sector_loaded', {sector, count:state.remoteCells.size});
      if(typeof renderArchiveCells === 'function') renderArchiveCells();
      if(typeof window.renderArchiveGridActive === 'function') window.renderArchiveGridActive();
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
        text:remote.message || 'Капсула ожидает публикации.',
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
      const data = await apiFetch(`${API.getCell}?cell=${Number(n)}`, {method:'GET'});
      if(data.cell){
        const c = data.cell;
        openActionModal(
          'Ячейка #'+pad(c.cell_number),
          `Статус: ${c.status === 'published' ? 'опубликована' : 'ожидает модерации'}\nВладелец: ${c.nickname || 'Аноним'}\nГод: ${c.memory_year || '2007'}\n\n“${c.message || ''}”\n\nПостоянный адрес капсулы:\n${location.origin}/cell/${pad(c.cell_number)}`
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

  // После переключения сектора пробуем подтянуть backend.
  document.addEventListener('click', function(e){
    if(e.target && (e.target.id === 'prevSector' || e.target.id === 'nextSector')){
      state.lastSectorLoaded = null;
      setTimeout(loadSectorFromBackend, 250);
    }
  });

  window.addEventListener('load', ()=>{
    setTimeout(loadSectorFromBackend, 600);
    handlePaymentReturn();
  });

  async function handlePaymentReturn(){
    const q = new URLSearchParams(location.search);
    const reservation = q.get('payment_check') || q.get('reservation_id');
    const claim = q.get('claim') || q.get('claim_token');
    if(!reservation || !claim) return;
    try{
      const data = await apiFetch(API.checkPayment + `?reservation_id=${encodeURIComponent(reservation)}&claim=${encodeURIComponent(claim)}`, {method:'GET'});
      if(data.paid && data.cell){
        const c = data.cell;
        openActionModal('Капсула оплачена и ожидает модерации', `Ячейка: #${pad(c.cell_number)}\nКод владельца: ${c.owner_code}\nСтатус: ${c.status}\nПостоянный адрес: ${location.origin}${c.link}\n\nСохрани код владельца.`);
      }
    }catch(e){ console.warn('payment check failed', e.message); }
  }


  window.Capsule2007V5 = {loadSectorFromBackend, state};
})();