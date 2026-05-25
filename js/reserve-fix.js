/* Capsule2007 FINAL reserve flow fix */
(function(){
  let selectedCell = 0;

  function pad(n){
    return String(n).padStart(5, '0');
  }

  function getCellNumber(el){
    return Number(
      el?.dataset?.cell ||
      el?.dataset?.n ||
      el?.textContent?.replace(/\D/g,'') ||
      0
    );
  }

  function getSelectedFromDom(){
    const picked = document.querySelector('#cellGrid .cell.selected');
    return getCellNumber(picked);
  }

  function syncButton(){
    const btn = document.getElementById('quickReserveBtn');
    if (!btn) return;

    const domCell = getSelectedFromDom();
    if (domCell) selectedCell = domCell;

    btn.disabled = false;
    btn.style.pointerEvents = 'auto';

    if (selectedCell) {
      btn.classList.add('isActive');
      btn.textContent = 'Занять ячейку #' + pad(selectedCell);
    } else {
      btn.classList.remove('isActive');
      btn.textContent = 'Сначала выбери свободную ячейку';
    }
  }

  function openReserve(){
    const block = document.getElementById('reserveCellBlock');
    if (!block || !selectedCell) return;

    const input = document.getElementById('reserveCellInput');
    const preview = document.getElementById('reservePreview');
    const submit = document.getElementById('reserveSubmitBtn');
    const notice = document.getElementById('reserveNotice');

    if (input) input.value = '#' + pad(selectedCell);
    if (preview) {
      preview.textContent =
        'Будущий постоянный адрес капсулы:\n' +
        'capsule2007.ru/cell/' + pad(selectedCell) +
        '\nКод владельца появится после оплаты.';
    }
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Продолжить к оплате 107 ₽';
      submit.classList.remove('isDone');
    }
    if (notice) notice.textContent = 'Ячейка выбрана. Напиши 160 символов прошлого — дальше будет переход к оплате.';

    block.classList.add('isOpen');
    block.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    setTimeout(() => document.getElementById('reserveMemory')?.focus(), 150);
  }

  document.addEventListener('click', function(e){
    const cell = e.target.closest && e.target.closest('#cellGrid .cell');
    if (!cell) return;

    if (cell.classList.contains('taken')) return;

    document.querySelectorAll('#cellGrid .cell.selected').forEach(x => {
      if (x !== cell) x.classList.remove('selected');
    });

    cell.classList.toggle('selected');
    selectedCell = cell.classList.contains('selected') ? getCellNumber(cell) : 0;

    setTimeout(syncButton, 30);
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('#quickReserveBtn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectedCell = selectedCell || getSelectedFromDom();

    if (!selectedCell) {
      const archive = document.getElementById('archive');
      archive?.classList.add('cellPickPulse');
      setTimeout(() => archive?.classList.remove('cellPickPulse'), 1200);
      document.getElementById('cellGrid')?.scrollIntoView({behavior:'smooth', block:'start'});
      syncButton();
      return;
    }

    openReserve();
  }, true);

  document.addEventListener('submit', async function(e){
    const form = e.target.closest && e.target.closest('#reserveForm');
    if (!form) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectedCell = selectedCell || getSelectedFromDom();

    const notice = document.getElementById('reserveNotice');
    const submit = document.getElementById('reserveSubmitBtn');

    const nickname = (document.getElementById('reserveName')?.value || 'Аноним').trim() || 'Аноним';
    const memory_year = document.getElementById('reserveYear')?.value || '2007';
    const message = (document.getElementById('reserveMemory')?.value || '').trim();

    if (!selectedCell) {
      if (notice) notice.textContent = 'Сначала выбери свободную ячейку.';
      return;
    }

    if (message.length < 8) {
      if (notice) notice.textContent = 'Напиши хотя бы короткое воспоминание.';
      document.getElementById('reserveMemory')?.focus();
      return;
    }

    try {
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Создаём оплату...';
      }

      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          cell_number: selectedCell,
          nickname,
          memory_year,
          message
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Ошибка создания оплаты');
      }

      const url =
        data.confirmation_url ||
        data.confirmationUrl ||
        data.payment_url ||
        data.url ||
        data.confirmation?.confirmation_url;

      if (url) {
        window.location.href = url;
        return;
      }

      if (notice) notice.textContent = 'Оплата создана, но ссылка не вернулась. Проверь API.';
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Повторить';
      }
    } catch(err) {
      if (notice) notice.textContent = 'Ошибка: ' + err.message;
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Повторить переход к оплате';
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', syncButton);
  window.addEventListener('load', syncButton);
  setInterval(syncButton, 700);
})();
