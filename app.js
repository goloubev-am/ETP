let parsedVehicles = [];
let currentRole = 'client';
const API = '/api';

const OPTIONS = [
  { id: '300', name: 'GAP (страхование финансовых рисков)' },
  { id: '301', name: 'НС (несчастный случай)' },
  { id: '302', name: 'ДГО с франшизой' },
  { id: '304', name: 'БПЛА (беспилотники)' },
  { id: '200', name: 'Агрегатная форма возмещения' },
  { id: '210', name: 'Единовременная оплата' }
];

// --- Переключение ролей ---
function switchRole(role) {
  currentRole = role;
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.role-switch button').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${role}`).style.display = 'block';
  document.getElementById(`btn-${role}`).classList.add('active');
  loadTenders();
}

// --- Клиент: Загрузка реестра ---
async function uploadRegistry() {
  const fileInput = document.getElementById('fileRegistry');
  if (!fileInput.files.length) return alert('Выберите файл');
  
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const res = await fetch(`${API}/upload-registry`, { method: 'POST', body: formData });
  const data = await res.json();
  parsedVehicles = data.vehicles;
  
  let html = '<table><tr><th>Марка</th><th>Модель</th><th>VIN</th><th>Год</th><th>Сумма</th></tr>';
  parsedVehicles.forEach(v => {
    html += `<tr><td>${v.mark}</td><td>${v.model}</td><td>${v.vin}</td><td>${v.year}</td><td>${v.value}</td></tr>`;
  });
  html += '</table>';
  document.getElementById('registryPreview').innerHTML = html;
}

// --- Клиент: Создание тендера ---
async function createTender() {
  const selectedOptions = Array.from(document.querySelectorAll('.option-checkbox:checked')).map(cb => cb.value);
  const budget = parseFloat(document.getElementById('budget').value);
  const insurersStr = document.getElementById('targetInsurers').value;
  const insurers = insurersStr ? insurersStr.split(',').map(s => s.trim()) : ['ALL'];

  if (!parsedVehicles.length) return alert('Загрузите реестр ТС');

  const body = {
    client_name: 'ООО "Гринфилдс-Логистика"',
    budget: budget,
    options: selectedOptions,
    vehicles: parsedVehicles,
    target_insurers: insurers
  };

  const res = await fetch(`${API}/tenders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    alert('Тендер сформирован! ТЗ и описание отправлены страховщикам.');
    loadTenders();
  }
}

// --- Загрузка списка тендеров ---
async function loadTenders() {
  const res = await fetch(`${API}/tenders`);
  const tenders = await res.json();
  
  const clientList = document.getElementById('clientTenderList');
  const insurerList = document.getElementById('insurerTenderList');
  clientList.innerHTML = '';
  insurerList.innerHTML = '';

  tenders.forEach(t => {
    // --- Отрисовка для Клиента ---
    let clientHtml = `
      <div class="tender-item">
        <h3>Тендер #${t.id} <span class="badge ${t.status}">${t.status}</span></h3>
        <div class="meta">Бюджет: ${formatMoney(t.budget)} | ТС: ${t.vehicles.length} шт.</div>
    `;
    if (t.status === 'ALL_OFFERS_RECEIVED' || t.status === 'KP_SUBMITTED') {
      clientHtml += `<button onclick="showSummary('${t.id}')">📊 Сформировать Сводный КП</button>`;
    }
    if (t.winner_id) {
      clientHtml += `<p class="winner">🏆 Победитель: ${t.winner_id}</p>`;
    }
    clientHtml += `</div>`;
    clientList.innerHTML += clientHtml;

    // --- Отрисовка для Страховщика ---
    let insurerHtml = `
      <div class="tender-item">
        <h3>Тендер #${t.id}</h3>
        <div class="meta">${t.client_name} | ТС: ${t.vehicles.length} шт.</div>
        <div class="actions">
    `;
    
    if (t.status === 'CREATED') {
      insurerHtml += `
        <button class="success" onclick="acceptTender('${t.id}')">Принять в работу</button>
        <button class="danger" onclick="declineTender('${t.id}')">Отказаться</button>
      `;
    } else if (t.status === 'ACCEPTED') {
      insurerHtml += `<button onclick="openOfferForm('${t.id}', '${t.client_name}')">📎 Заполнить и отправить КП</button>`;
    } else {
      insurerHtml += `<span class="hint">КП отправлено. Ожидание решения.</span>`;
    }
    insurerHtml += `</div></div>`;
    insurerList.innerHTML += insurerHtml;
  });
}

// --- Действия Страховщика ---
async function acceptTender(id) {
  await fetch(`${API}/tender/action?id=${id}&action=accept&insurer=СК ПАРИ`, { method: 'POST' });
  loadTenders();
}

async function declineTender(id) {
  await fetch(`${API}/tender/action?id=${id}&action=decline&insurer=СК ПАРИ`, { method: 'POST' });
  loadTenders();
}

function openOfferForm(id, clientName) {
  document.getElementById('offerTenderId').value = id;
  document.getElementById('offerTenderTitle').textContent = `Заказчик: ${clientName}`;
  document.getElementById('offerFormCard').style.display = 'block';
}

async function submitOffer(e) {
  e.preventDefault();
  const id = document.getElementById('offerTenderId').value;
  
  const offer = {
    insurer_id: document.getElementById('insurerName').value,
    price: parseFloat(document.getElementById('oPrice').value),
    franchise: parseFloat(document.getElementById('oFranchise').value),
    kasko_rate: parseFloat(document.getElementById('oKasko').value),
    osago_rate: parseFloat(document.getElementById('oOsago').value),
    payout_days: parseInt(document.getElementById('oDays').value),
    rating_score: parseFloat(document.getElementById('oRating').value)
  };

  const res = await fetch(`${API}/tender/offer?id=${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(offer)
  });

  if (res.ok) {
    alert('КП успешно отправлено и заблокировано для изменений.');
    document.getElementById('offerFormCard').style.display = 'none';
    loadTenders();
  }
}

// --- Сводный КП (Клиент) ---
async function showSummary(tenderId) {
  const res = await fetch(`${API}/tender/summary?id=${tenderId}`);
  const results = await res.json();
  
  let html = `<div class="modal-overlay" onclick="this.remove()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h2>Сводный КП (Скоринг)</h2>
      <table class="offer-table">
        <tr><th>Место</th><th>Страховщик</th><th>Цена</th><th>Балл</th><th>Действие</th></tr>`;
  
  results.forEach((r, i) => {
    html += `
      <tr>
        <td>${i+1}</td>
        <td>${r.insurer_id}</td>
        <td>${formatMoney(r.price)}</td>
        <td class="best">${r.total_score.toFixed(3)}</td>
        <td><button onclick="selectWinner('${tenderId}', '${r.insurer_id}')">Выбрать</button></td>
      </tr>
    `;
  });
  
  html += `</table>
      <button class="danger" style="margin-top:1rem" onclick="this.closest('.modal-overlay').remove()">Закрыть</button>
    </div>
  </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
}

async function selectWinner(tenderId, insurerId) {
  await fetch(`${API}/tender/winner?id=${tenderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner_id: insurerId })
  });
  document.querySelector('.modal-overlay').remove();
  loadTenders();
}

// --- Утилиты ---
function formatMoney(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  const optContainer = document.getElementById('optionsList');
  OPTIONS.forEach(o => {
    optContainer.innerHTML += `<label class="checkbox-label"><input type="checkbox" class="option-checkbox" value="${o.id}"> ${o.name}</label>`;
  });
  loadTenders();
});