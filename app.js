// Меню на 30 дней: статическое приложение без сборки.
// Исходные данные лежат в data.json (это и есть «база»). Изменения в браузере
// сохраняются в localStorage и выгружаются кнопкой «Экспорт data.json».

const KEY = {
  start: 'menu.start',
  dishes: 'menu.dishes',
  plan: 'menu.plan',
  overrides: 'menu.overrides',
  checked: 'menu.checked',
  receipts: 'menu.receipts'
};
const MEAL = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
const TYPE_TITLE = { breakfast: 'Завтраки', lunch: 'Обеды', soup: 'Супы (суббота и воскресенье)', dinner: 'Ужины' };

let D = {};        // текущие данные: startDate, dishes, plan, bulk, weekly
let viewDay = 1;   // день, который показываем на вкладке «Сегодня»

const $ = (sel) => document.querySelector(sel);
const read = (k, def) => {
  try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
  catch { return def; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---------- даты и план ----------
function parseDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function dateOfDay(n) { const s = parseDate(D.startDate); s.setDate(s.getDate() + n - 1); return s; }
function fmtDate(dt) { return dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }); }
function todayDay() {
  const s = parseDate(D.startDate);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((t - s) / 86400000) + 1;
}
function isWeekend(n) { const w = dateOfDay(n).getDay(); return w === 0 || w === 6; }
function planDay(n) { return D.plan.find((p) => p.day === n); }
function dishByName(name) { return D.dishes.find((x) => x.name === name); }

// Блюдо, которое стоит сегодня в слоте: замена из overrides или то, что в плане
function currentMeal(n, slot) {
  const ov = read(KEY.overrides, {});
  return (ov[n] && ov[n][slot]) || (planDay(n) && planDay(n)[slot]) || '';
}

// Пул для замены: обед в субботу и воскресенье — это супы
function poolFor(n, slot) {
  const type = slot === 'lunch' ? (isWeekend(n) ? 'soup' : 'lunch') : slot;
  return D.dishes.filter((d) => d.type === type).map((d) => d.name);
}

function setMeal(n, slot, name) {
  const ov = read(KEY.overrides, {});
  const apply = (day, value) => {
    ov[day] = ov[day] || {};
    if (planDay(day) && planDay(day)[slot] === value) delete ov[day][slot];
    else ov[day][slot] = value;
    if (!Object.keys(ov[day]).length) delete ov[day];
  };
  apply(n, name);
  // Суп варится на два дня: меняем и воскресенье, если это суббота
  if (slot === 'lunch' && dateOfDay(n).getDay() === 6 && planDay(n + 1)) apply(n + 1, name);
  write(KEY.overrides, ov);
}

function revertMeal(n, slot) {
  const ov = read(KEY.overrides, {});
  const clear = (day) => {
    if (ov[day]) { delete ov[day][slot]; if (!Object.keys(ov[day]).length) delete ov[day]; }
  };
  clear(n);
  if (slot === 'lunch' && dateOfDay(n).getDay() === 6) clear(n + 1);
  write(KEY.overrides, ov);
}

// ---------- модальное окно ----------
function showModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function hideModal() { $('#modal').classList.add('hidden'); }

// ---------- вкладка «Сегодня» ----------
function renderToday() {
  const el = $('#tab-today');
  const t = todayDay();
  const max = D.plan.length;
  const n = viewDay;
  const isToday = n === t;

  let html = `
    <div class="card nav-day">
      <button class="btn ghost" id="prev" ${n <= 1 ? 'disabled' : ''}>←</button>
      <div style="text-align:center">
        <div><strong>День ${n} из ${max}</strong></div>
        <div class="muted">${esc(fmtDate(dateOfDay(n)))}${isToday ? ' · сегодня' : ''}</div>
      </div>
      <button class="btn ghost" id="next" ${n >= max ? 'disabled' : ''}>→</button>
    </div>`;

  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const name = currentMeal(n, slot);
    const planName = planDay(n) ? planDay(n)[slot] : '';
    const dish = dishByName(name);
    const replaced = name !== planName;
    html += `
      <div class="card">
        <div class="slot-head">
          <span class="slot-label">${MEAL[slot]}${slot === 'lunch' && isWeekend(n) ? ' · суп' : ''}</span>
          <button class="btn ghost" data-replace="${slot}">Заменить</button>
        </div>
        <div class="dish-name">${esc(name)}</div>
        ${replaced ? `<div class="muted">Заменено. По плану: ${esc(planName)}. <a href="#" data-revert="${slot}">Вернуть</a></div>` : ''}
        ${dish ? `<details><summary>Состав и приготовление</summary>
          <p><b>Состав:</b> ${esc(dish.composition)}</p>
          <p><b>Как готовить:</b> ${esc(dish.steps)}</p></details>` : ''}
      </div>`;
  }
  el.innerHTML = html;

  $('#prev').onclick = () => { viewDay--; renderToday(); };
  $('#next').onclick = () => { viewDay++; renderToday(); };
  el.querySelectorAll('[data-replace]').forEach((b) => {
    b.onclick = () => openReplace(n, b.dataset.replace);
  });
  el.querySelectorAll('[data-revert]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); revertMeal(n, a.dataset.revert); renderToday(); };
  });
}

function openReplace(n, slot) {
  const pool = poolFor(n, slot);
  const cur = currentMeal(n, slot);
  const body = pool.length
    ? pool.map((name) => `<button class="pick ${name === cur ? 'current' : ''}" data-pick="${esc(name)}">${esc(name)}</button>`).join('')
    : '<p class="muted">Нет блюд этого типа. Добавьте их на вкладке «Блюда».</p>';
  showModal(`${MEAL[slot]}, день ${n}: что приготовить`, body);
  $('#modal-body').querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => { setMeal(n, slot, b.dataset.pick); hideModal(); renderToday(); };
  });
}

// ---------- вкладка «Блюда» ----------
function renderDishes() {
  const el = $('#tab-dishes');
  let html = '';
  for (const type of ['breakfast', 'lunch', 'soup', 'dinner']) {
    const list = D.dishes.map((d, i) => ({ d, i })).filter((x) => x.d.type === type);
    html += `<div class="group-title">${TYPE_TITLE[type]} · ${list.length}</div>`;
    for (const { d, i } of list) {
      const used = D.plan.filter((p) => p.breakfast === d.name || p.lunch === d.name || p.dinner === d.name).length;
      html += `
        <div class="card">
          <div class="slot-head">
            <div class="dish-name">${esc(d.name)}</div>
            <button class="btn danger" data-del="${i}">Удалить</button>
          </div>
          <div class="muted">В плане дней: ${used}</div>
          <details><summary>Состав и приготовление</summary>
            <p><b>Состав:</b> ${esc(d.composition)}</p>
            <p><b>Как готовить:</b> ${esc(d.steps)}</p></details>
        </div>`;
    }
  }
  html += `
    <div class="card">
      <h3 style="margin-top:0">Добавить блюдо</h3>
      <label>Название</label><input id="d-name">
      <label>Тип</label>
      <select id="d-type">
        <option value="breakfast">Завтрак</option>
        <option value="lunch">Обед</option>
        <option value="soup">Суп (суббота и воскресенье)</option>
        <option value="dinner">Ужин</option>
      </select>
      <label>Состав (продукты и граммовки)</label><textarea id="d-comp" rows="2"></textarea>
      <label>Как готовить</label><textarea id="d-steps" rows="2"></textarea>
      <button class="btn" id="d-add">Добавить</button>
    </div>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      const dish = D.dishes[Number(b.dataset.del)];
      if (!confirm(`Удалить «${dish.name}»? Из плана оно не исчезнет, но для замены будет недоступно.`)) return;
      D.dishes.splice(Number(b.dataset.del), 1);
      write(KEY.dishes, D.dishes);
      renderDishes();
    };
  });
  $('#d-add').onclick = () => {
    const name = $('#d-name').value.trim();
    if (!name) return alert('Введите название блюда');
    if (dishByName(name)) return alert('Такое блюдо уже есть');
    D.dishes.push({
      name,
      type: $('#d-type').value,
      composition: $('#d-comp').value.trim(),
      steps: $('#d-steps').value.trim()
    });
    write(KEY.dishes, D.dishes);
    renderDishes();
  };
}

// ---------- вкладка «Покупки» ----------
function renderShopping() {
  const el = $('#tab-shopping');
  const checked = read(KEY.checked, {});
  const section = (title, list, prefix) => {
    let s = `<div class="card"><h3 style="margin-top:0">${esc(title)}</h3>`;
    let group = '';
    list.forEach((item, i) => {
      if (item.group !== group) { group = item.group; s += `<div class="group-title">${esc(group)}</div>`; }
      const key = prefix + i;
      const done = !!checked[key];
      s += `<label class="check-item ${done ? 'done' : ''}">
        <input type="checkbox" data-key="${key}" ${done ? 'checked' : ''}>
        <span>${esc(item.name)} — <b>${esc(item.qty)}</b></span></label>`;
    });
    return s + '</div>';
  };

  const checkedNames = [...D.bulk, ...D.weekly]
    .filter((it, idx) => checked[(idx < D.bulk.length ? 'b' + idx : 'w' + (idx - D.bulk.length))])
    .map((it) => it.name);
  const total = checkedNames.length;

  const receipts = read(KEY.receipts, []);
  const sum = receipts.reduce((a, r) => a + Number(r.total || 0), 0);
  const receiptsHtml = receipts.length
    ? receipts.map((r, i) => `<tr><td>${esc(r.date)}</td><td>${esc(r.store)}</td><td>${Number(r.total).toLocaleString('ru-RU')} ₽</td>
        <td><a href="#" data-rdel="${i}">удалить</a></td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">Чеков пока нет</td></tr>';

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <span class="muted">Отмечено: ${total} из ${D.bulk.length + D.weekly.length}</span>
      <button class="btn ghost" id="reset-checks">Снять все отметки</button>
    </div>
    ${section('Закупка на месяц (один раз)', D.bulk, 'b')}
    ${section('Каждую неделю', D.weekly, 'w')}
    <div class="card">
      <h3 style="margin-top:0">Чек закупки</h3>
      <label>Магазин</label><input id="r-store" placeholder="Например, Пятёрочка">
      <label>Дата</label><input id="r-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
      <label>Итоговая сумма, ₽</label><input id="r-total" inputmode="decimal" placeholder="0">
      <label>Комментарий</label><input id="r-note">
      <button class="btn" id="save-receipt">Сохранить чек</button>
      <p class="muted">После сохранения отметки в списке сбрасываются. Отмечено сейчас: ${total} позиций.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">История чеков</h3>
      <table><tr><th>Дата</th><th>Магазин</th><th>Сумма</th><th></th></tr>${receiptsHtml}</table>
      <p><b>Всего потрачено:</b> ${sum.toLocaleString('ru-RU')} ₽</p>
    </div>`;

  el.querySelectorAll('input[data-key]').forEach((cb) => {
    cb.onchange = () => {
      const c = read(KEY.checked, {});
      if (cb.checked) c[cb.dataset.key] = true; else delete c[cb.dataset.key];
      write(KEY.checked, c);
      renderShopping();
    };
  });
  $('#reset-checks').onclick = () => { write(KEY.checked, {}); renderShopping(); };
  $('#save-receipt').onclick = () => {
    const total = parseFloat(String($('#r-total').value).replace(',', '.'));
    if (!total) return alert('Введите сумму чека');
    const rs = read(KEY.receipts, []);
    rs.unshift({
      date: $('#r-date').value,
      store: $('#r-store').value.trim(),
      total,
      items: checkedNames.length,
      note: $('#r-note').value.trim()
    });
    write(KEY.receipts, rs);
    write(KEY.checked, {});
    renderShopping();
  };
  el.querySelectorAll('[data-rdel]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      const rs = read(KEY.receipts, []);
      rs.splice(Number(a.dataset.rdel), 1);
      write(KEY.receipts, rs);
      renderShopping();
    };
  });
}

// ---------- вкладка «Настройки» ----------
function renderSettings() {
  const el = $('#tab-settings');
  el.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Дата первого дня плана</h3>
      <input id="s-start" type="date" value="${esc(D.startDate)}">
      <p class="muted">От этой даты считается день 1 из 30.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">База данных</h3>
      <p class="muted">Изменения блюд и плана хранятся в этом браузере. Чтобы они попали в репозиторий, нажмите «Экспорт data.json», замените файл data.json в папке C:\\menu и закоммитьте его.</p>
      <div class="row">
        <button class="btn" id="s-export">Экспорт data.json</button>
        <label class="btn ghost" style="cursor:pointer">Импорт data.json<input id="s-import" type="file" accept="application/json" class="hidden"></label>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Сброс</h3>
      <p class="muted">Удаляет локальные правки блюд, плана, замены и отметки покупок. Чеки сохраняются.</p>
      <button class="btn danger" id="s-reset">Сбросить локальные правки</button>
    </div>`;

  $('#s-start').onchange = (e) => {
    D.startDate = e.target.value;
    write(KEY.start, D.startDate);
    viewDay = Math.min(Math.max(todayDay(), 1), D.plan.length);
    renderAll();
  };
  $('#s-export').onclick = () => {
    const data = { startDate: D.startDate, dishes: D.dishes, plan: D.plan, bulk: D.bulk, weekly: D.weekly };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#s-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.dishes) || !Array.isArray(j.plan)) throw new Error('нет dishes или plan');
      D.dishes = j.dishes; D.plan = j.plan;
      if (j.startDate) { D.startDate = j.startDate; write(KEY.start, j.startDate); }
      if (Array.isArray(j.bulk)) D.bulk = j.bulk;
      if (Array.isArray(j.weekly)) D.weekly = j.weekly;
      write(KEY.dishes, D.dishes);
      write(KEY.plan, D.plan);
      alert('Данные импортированы');
      renderAll();
    } catch (err) {
      alert('Не удалось импортировать файл: ' + err.message);
    }
  };
  $('#s-reset').onclick = async () => {
    if (!confirm('Сбросить локальные правки?')) return;
    [KEY.dishes, KEY.plan, KEY.overrides, KEY.checked, KEY.start].forEach((k) => localStorage.removeItem(k));
    await loadBase();
    renderAll();
  };
}

// ---------- загрузка и запуск ----------
async function loadBase() {
  const base = await (await fetch('data.json', { cache: 'no-store' })).json();
  D = {
    startDate: read(KEY.start, base.startDate),
    dishes: read(KEY.dishes, base.dishes),
    plan: read(KEY.plan, base.plan),
    bulk: base.bulk,
    weekly: base.weekly
  };
  viewDay = Math.min(Math.max(todayDay(), 1), D.plan.length);
}

function renderAll() {
  renderToday();
  renderDishes();
  renderShopping();
  renderSettings();
}

function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
}

async function init() {
  document.querySelectorAll('nav button').forEach((b) => {
    b.onclick = () => { showTab(b.dataset.tab); window.scrollTo(0, 0); };
  });
  $('#modal-close').onclick = hideModal;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') hideModal(); };
  try {
    await loadBase();
    renderAll();
  } catch (err) {
    document.querySelector('main').innerHTML = `<div class="card">Не удалось загрузить data.json. Откройте приложение через ссылку GitHub Pages или локальный сервер (см. README), а не файлом.<br><span class="muted">${esc(err.message)}</span></div>`;
  }
}

init();
