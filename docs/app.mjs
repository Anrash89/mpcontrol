import {markets, categories, statuses, priorities, requestStatus, taskActive, role, recurringTypes, approvalTypes, approvalStatuses, dateKey, formatDate, person, taskOrder, taskActions, transitions, overview, launchRisks} from "./model.mjs";
import {command, materializeSchedules} from "./domain.mjs";
import {demoUsers, demoState} from "./demo.mjs";

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9m-9 4h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m10 3-.6 2.3-1.3.8-2.3-.6-2 3.5 1.6 1.7v1.6l-1.6 1.7 2 3.5 2.3-.6 1.3.8.6 2.3h4l.6-2.3 1.3-.8 2.3.6 2-3.5-1.6-1.7v-1.6l1.6-1.7-2-3.5-2.3.6-1.3-.8L14 3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.5"/>',
  calendar: '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6m8-6v6M4 11h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  progress: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert: '<path d="M12 8v5m0 3h.01"/><circle cx="12" cy="12" r="9"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  cloud: '<path d="M7.5 18H18a4 4 0 1 0-.8-7.9 5.5 5.5 0 0 0-10.6 1A3.5 3.5 0 0 0 7.5 18Z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 17h2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 15V3m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
};
const icon = (name, size = 20) =>
  '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);

const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const params = new URLSearchParams(location.search);
const views = {
  overview: {label: "Обзор", icon: "grid"},
  inbox: {label: "Входящие заявки", icon: "download"},
  mine: {label: "Мои задачи", icon: "check"},
  products: {label: "Товары и запуски", icon: "layers"},
  operations: {label: "Поставки и продвижение", icon: "arrow"},
  schedules: {label: "Регулярные задачи", icon: "calendar"},
  archive: {label: "Архив", icon: "archive"},
};
const ops = {supply: "Поставка", promotion: "Продвижение"};
const week = {1: "Понедельник", 2: "Вторник", 3: "Среда", 4: "Четверг", 5: "Пятница", 6: "Суббота", 0: "Воскресенье"};
const listFilters = {all: "Все", requests: "Заявки", reviews: "На проверке", late: "Просрочено", conflicts: "Конфликты сроков", team: "Очередь команды"};

let state;
let current;
let users = [];
let today;
let demo = false;
let staticMode = false;
let view = "overview";
let focus = "all";
let market = "all";
let status = "all";
let query = "";
let selectedPerson = "";
let toastTimer;
let working = false;
let dialogDraw;
let pollCounter = 0;

const click = (action, value = "") => 'data-action="' + action + '" data-value="' + escape(value) + '"';
const button = (label, action, value = "", cls = "secondary", glyph = "") =>
  '<button type="button" class="button ' + cls + '" ' + click(action, value) + '>' + (glyph ? icon(glyph, 17) : "") + escape(label) + '</button>';
const userName = (id) => person(users, id);
const productName = (id) => state.products.find((item) => item.id === id)?.title || "";
const launchName = (id) => state.launches.find((item) => item.id === id)?.title || "";
const badge = (key) => '<span class="status ' + escape(key) + '">' + escape(statuses[key]) + '</span>';
const marketTag = (key) => '<span class="market-tag ' + escape(key) + '">' + escape(markets[key]) + '</span>';
const linkTo = (url, label) => url ? '<a class="inline-link" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ' + icon("arrow", 14) + '</a>' : "";
const stageDate = (date) => formatDate(date);
const canLead = () => current?.role === "lead";
const isLate = (task) => taskActive(task) && Boolean(task.due && task.due < today);
const marketMatch = (task) => market === "all" || task.market === market;
const searchTask = (task) => !query || [task.title, task.note, productName(task.productId), launchName(task.launchId), userName(task.authorId), userName(task.assigneeId)]
  .concat(state.products.filter((product) => product.id === task.productId).flatMap((product) => [product.ozonSku, product.wbSku]))
  .join(" ").toLocaleLowerCase("ru").includes(query);
const detail = (label, value) => '<div class="detail"><dt>' + escape(label) + '</dt><dd>' + escape(value || "—") + '</dd></div>';
const records = (items, label = "Нет записей") => items.length ? '<div class="record-stack">' + items.join("") + '</div>' : empty(label);
const section = (title, body, action = "") => '<section class="panel"><div class="panel-head"><h2>' + escape(title) + '</h2>' + action + '</div>' + body + '</section>';

function setToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
async function api(path, body, raw = false) {
  const response = await fetch(new URL("./api/" + path, location.href), body === undefined ? {cache: "no-store"} : {
    method: "POST", headers: {"Content-Type": raw ? "application/octet-stream" : "application/json"},
    body: raw ? body : JSON.stringify(body),
  });
  if (!(response.headers.get("Content-Type") || "").includes("application/json")) {
    throw new ApiError("Сервер рабочего пространства недоступен", response.status === 404 || response.ok ? 404 : response.status);
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Ошибка сервера", response.status);
  return data;
}

function assignSnapshot(snapshot) {
  state = snapshot.state;
  today = snapshot.today;
  if (snapshot.user) current = snapshot.user;
  if (snapshot.users) users = snapshot.users;
}

async function loadSession() {
  try {
    assignSnapshot(await api("state"));
    demo = false;
    navigate("overview");
  } catch (error) {
    if (error.status === 404) {
      staticMode = true;
      startDemo();
    } else loginPage(error.status === 401 ? "" : error.message);
  }
}

function startDemo() {
  demo = true;
  today = dateKey();
  users = demoUsers;
  current = users[0];
  state = demoState();
  navigate("overview");
}

function loginPage(message = "") {
  demo = false;
  current = null;
  state = null;
  if (modal.open) modal.close();
  app.innerHTML = `<main class="login-layout"><div class="login-visual">
    <div class="brand"><img src="./mark.svg" width="44" height="44" alt=""><span>Селлер<small>Рабочее пространство</small></span></div>
    <div><h1>Работа команды<br>по маркетплейсам</h1><p>Заявки, задачи и запуски Ozon и Wildberries.</p></div>
    <div class="login-shapes" aria-hidden="true"><i></i><i></i><i></i></div>
  </div><div class="login-content"><div class="login-card">
    <h2>Войти в «Селлер»</h2><p>Логин и пароль выдаёт администратор команды.</p>
    <form data-form="login">
      <label class="field">Логин<input name="login" required autocomplete="username"></label>
      <label class="field">Пароль<input name="password" type="password" required autocomplete="current-password"></label>
      <p class="form-error" role="alert" ${message ? "" : "hidden"}>${escape(message)}</p>
      <button type="submit" class="button primary">Войти</button>
    </form>${button("Открыть демоверсию", "demo", "", "secondary")}
  </div></div></main>`;
}

function nav() {
  return Object.entries(views).filter(([key]) => key !== "schedules" || canLead()).map(([key, item]) =>
    '<button type="button" class="nav-item ' + (key === view ? "selected" : "") + '" ' + click("nav", key) +
      (key === view ? ' aria-current="page"' : '') + '>' + icon(item.icon, 19) + '<span>' + item.label + '</span></button>').join("");
}

function render() {
  const display = views[view].label;
  const newLabel = view === "inbox" || !canLead() ? "Новая заявка" : "Создать";
  app.innerHTML = `
    <a class="skip" href="#main">К содержимому</a>
    <aside class="sidebar">
      <button type="button" class="brand" ${click("nav", "overview")} aria-label="Селлер, обзор">
        <img src="./mark.svg" width="39" height="39" alt=""><span>Селлер<small>Маркетплейсы</small></span>
      </button>
      <nav class="side-nav" aria-label="Разделы">${nav()}</nav>
      <div class="side-bottom">${button("Настройки", "settings", "", "quiet", "settings")}</div>
    </aside>
    <div class="layout"><header class="topbar">
      <button type="button" class="brand mobile-brand" ${click("nav", "overview")}><img src="./mark.svg" width="32" height="32" alt=""><span>Селлер</span></button>
      <span class="top-title">Рабочее пространство</span>
      <div class="top-actions">
        ${demo ? '<span class="demo-flag">Демо</span>' : ''}
        <button type="button" class="account" ${click("settings")} aria-label="Настройки профиля">
          <span class="avatar">${escape(current.name.slice(0, 1))}</span><span class="account-name">${escape(current.name)}<small>${escape(role(current))}</small></span>${icon("chevron", 15)}
        </button>
      </div>
    </header>
    <main id="main">
      <div class="page-head"><div><p class="page-caption">${escape(formatDate(today, {weekday: "long", day: "numeric", month: "long"}))}</p><h1>${display}</h1></div>
        ${button(newLabel, "create", view === "inbox" || !canLead() ? "request" : "", "primary new-task", "plus")}
      </div>
      ${demo ? '<div class="demo-banner"><span>Демоверсия. Изменения действуют до перезагрузки.</span>' + button("Сменить роль", "settings", "", "quiet") + '</div>' : ""}
      ${body()}
    </main></div>
    <nav class="bottom-nav" aria-label="Быстрый доступ">${["overview", "inbox", "mine"].map((key) =>
      '<button type="button" class="nav-item ' + (view === key ? "selected" : "") + '" ' + click("nav", key) + '>' + icon(views[key].icon, 19) + '<span>' + ({overview:"Обзор",inbox:"Заявки",mine:"Задачи"})[key] + '</span></button>').join("")}
      <button type="button" class="nav-item ${["overview", "inbox", "mine"].includes(view) ? "" : "selected"}" ${click("mobileMenu")}>${icon("list", 19)}<span>Ещё</span></button>
    </nav>`;
}

function navigate(next, nextFocus = "all") {
  view = next;
  focus = nextFocus;
  market = "all";
  status = "all";
  query = "";
  selectedPerson = "";
  if (modal.open) modal.close();
  render();
  window.scrollTo(0, 0);
}

function empty(label, text = "") {
  return '<div class="empty"><span class="empty-icon">' + icon("layers", 24) + '</span><strong>' + escape(label) +
    (text ? '<p>' + escape(text) + '</p>' : '') + '</div>';
}

function taskRow(task) {
  const sku = state.products.find((item) => item.id === task.productId)?.[task.market === "ozon" ? "ozonSku" : "wbSku"];
  return `<button type="button" class="task-row" ${click("task", task.id)}>
    <span class="task-icon ${task.status}">${icon(task.status === "done" ? "check" : requestStatus(task.status) ? "download" : "list", 18)}</span>
    <span class="task-main"><strong>${escape(task.title)}</strong><span class="task-meta">${marketTag(task.market)}<span>${categories[task.category]}</span>${sku ? '<span>Арт. ' + escape(sku) + '</span>' : ''}${task.priority === "high" ? '<span class="priority">Высокий приоритет</span>' : ''}</span></span>
    <span class="task-end">${badge(task.status)}<span class="task-owner">${escape(userName(requestStatus(task.status) ? task.authorId : task.assigneeId))}</span><span class="due ${isLate(task) ? "late" : ""}">${icon("calendar", 15)} ${task.due === today ? "Сегодня" : escape(stageDate(task.due))}</span></span>
    <span class="task-arrow">${icon("right", 16)}</span>
  </button>`;
}

const taskList = (items, message) => items.length ? '<div class="task-stack">' + [...items].sort(taskOrder).map(taskRow).join("") + '</div>' : empty(message || "Задач пока нет");

function filterBar({team = false, showStatus = true} = {}) {
  return `<div class="filters">
    <div class="market-tabs" role="group" aria-label="Площадка">${[["all", "Все площадки"], ...Object.entries(markets)].map(([key, label]) =>
      '<button type="button" class="chip ' + (market === key ? "active" : "") + '" ' + click("market", key) + ' aria-pressed="' + (market === key) + '">' +
      (key === "all" ? "" : '<span class="market-dot ' + key + '"></span>') + label + '</button>').join("")}</div>
    <div class="filter-inputs">
      <label class="search">${icon("search", 17)}<input type="search" id="query" aria-label="Поиск" placeholder="Поиск" value="${escape(query)}"></label>
      ${showStatus ? select("filter-status", "Статус", {all: "Все статусы", ...statuses}, status, false, true) : ""}
      ${team ? select("filter-person", "Исполнитель", {"": "Вся команда", ...Object.fromEntries(users.map((user) => [user.id, user.name]))}, selectedPerson, false, true) : ""}
    </div>
  </div>`;
}

function relevant() {
  const live = state.tasks.filter((task) => !task.archived);
  if (view === "inbox") {
    if (!canLead() || focus === "sent") return live.filter((task) => task.authorId === current.id &&
      (task.kind === "request" || requestStatus(task.status)));
    return live.filter((task) => requestStatus(task.status));
  }
  if (view === "archive") return state.tasks.filter((task) => task.archived && (canLead() || task.authorId === current.id || task.assigneeId === current.id));
  if (focus === "team" && canLead()) return live.filter((task) => !requestStatus(task.status) && (!selectedPerson || task.assigneeId === selectedPerson));
  if (focus !== "all" && canLead()) return overview(state, today)[focus] || live;
  return live.filter((task) => (!requestStatus(task.status) && task.assigneeId === current.id) ||
    (task.status === "review" && task.authorId === current.id));
}

function refreshRows() {
  const rows = document.querySelector("#filtered-rows");
  if (rows) {
    const items = relevant().filter((task) => marketMatch(task) && searchTask(task) && (status === "all" || status === task.status));
    rows.innerHTML = taskList(items, "По этому фильтру задач нет");
    document.querySelector("#result-count").textContent = items.length;
  }
}

function overviewPage() {
  const summary = overview(state, today);
  const launchCount = state.launches.filter((launch) => Object.values(launch.approvals).includes("pending")).length;
  if (!canLead()) {
    const active = state.tasks.filter((task) => taskActive(task) && !requestStatus(task.status) &&
      (task.assigneeId === current.id || (task.status === "review" && task.authorId === current.id)));
    return `<div class="summary member-summary">
      ${stat("Мои активные задачи", active.length, "list", "mine", "green")}
      ${stat("Мои заявки", state.tasks.filter((task) => taskActive(task) && task.authorId === current.id && (task.kind === "request" || requestStatus(task.status))).length, "download", "inbox")}
      ${stat("Требуют моей приёмки", summary.reviews.filter((task) => task.authorId === current.id).length, "check", "mine")}
    </div>${section("Ближайшие задачи", taskList(active.slice().sort(taskOrder).slice(0, 7)), button("Мои задачи", "nav", "mine", "quiet", "arrow"))}`;
  }
  const urgent = [...new Map([...summary.reviews, ...summary.late, ...summary.requests, ...summary.conflicts].map((task) => [task.id, task])).values()].slice(0, 8);
  return `<div class="summary">
      ${stat("Входящие заявки", summary.requests.length, "download", "inbox", "green")}
      ${stat("На проверке", summary.reviews.length, "check", "reviews")}
      ${stat("Просрочено", summary.late.length, "clock", "late", "warm")}
      ${stat("Запуски под угрозой", summary.launches.length, "alert", "products", "warm")}
    </div>
    <div class="overview-grid">
      ${section("Требуют внимания", taskList(urgent, "Нет срочных задач"), button("Очередь команды", "focus", "team", "quiet", "arrow"))}
      <div class="overview-side">
        ${section("Контроль запуска", records(summary.launches.map((launch) => miniLaunch(launch)), "Запусков под угрозой нет"),
          button("Все запуски", "nav", "products", "quiet"))}
        ${section("Согласования и сроки", '<div class="control-list">' +
          button("Конфликты сроков · " + summary.conflicts.length, "focus", "conflicts", "secondary", "clock") +
          button("Запуски с согласованиями · " + launchCount, "nav", "products", "secondary", "check") + '</div>')}
      </div>
    </div>`;
}

function stat(label, value, glyph, target, tone = "") {
  const action = Object.hasOwn(views, target) ? "nav" : "focus";
  return '<button type="button" class="stat ' + tone + '" ' + click(action, target) + '><span class="stat-icon">' +
    icon(glyph, 20) + '</span><span class="stat-value">' + value + '</span><span class="stat-label">' + escape(label) + '</span></button>';
}

function miniLaunch(launch) {
  const risks = launchRisks(launch, state.tasks, state.operations, today);
  return '<button type="button" class="record mini-record" ' + click("launchDetail", launch.id) + '><strong>' + escape(launch.title) +
    '</strong><span>' + escape(risks[0] || ("Старт " + stageDate(launch.start))) + '</span></button>';
}

function listPage() {
  const items = relevant().filter((task) => marketMatch(task) && searchTask(task) && (status === "all" || status === task.status));
  const team = canLead() && view === "mine";
  const choices = view === "inbox" && canLead() ? '<div class="view-tabs">' +
    button("Входящие", "inboxFocus", "all", focus === "all" ? "selected-tab" : "quiet") +
    button("Мои заявки", "inboxFocus", "sent", focus === "sent" ? "selected-tab" : "quiet") + '</div>' : team ? '<div class="view-tabs">' + Object.entries(listFilters).filter(([key]) => key !== "requests").map(([key, label]) =>
    button(key === "all" ? "Моя очередь" : label, "focus", key, focus === key ? "selected-tab" : "quiet")).join("") + '</div>' : "";
  const title = view === "inbox" ? (canLead() && focus !== "sent" ? "Заявки команды" : "Мои заявки") : view === "archive" ? "Архив задач" : focus === "all" ? "Моя очередь" : listFilters[focus];
  return choices + '<section class="panel"><div class="panel-head"><h2>' + title +
    ' <span class="count" id="result-count">' + items.length + '</span></h2></div>' +
    filterBar({team: team && focus === "team", showStatus: view !== "inbox" || !canLead() || focus === "sent"}) +
    '<div id="filtered-rows">' + taskList(items, view === "inbox" ? "Входящих заявок пока нет" : "Задач пока нет") + '</div></section>';
}

function productCard(product) {
  const skus = [product.ozonSku && ("Ozon · " + product.ozonSku), product.wbSku && ("Wildberries · " + product.wbSku)].filter(Boolean);
  return '<button type="button" class="record" ' + click("productDetail", product.id) + '><span class="record-icon">' + icon("layers", 19) +
    '</span><span class="record-main"><strong>' + escape(product.title) + '</strong><span>' + escape(skus.join("  /  ")) +
    '</span></span>' + icon("right", 17) + '</button>';
}

function productsPage() {
  return '<div class="two-panels">' +
    section("Карточки товаров", records(state.products.map(productCard), "Товаров пока нет"), button("Добавить товар", "product", "", "secondary", "plus")) +
    section("Запуски", records(state.launches.map(miniLaunch), "Запусков пока нет"), canLead() ? button("Новый запуск", "launch", "", "secondary", "plus") : "") + '</div>';
}

function operationCard(item) {
  const note = item.type === "supply" ? "Приёмка " : "Публикация ";
  return '<button type="button" class="record" ' + click("operationDetail", item.id) + '><span class="record-icon">' +
    icon(item.type === "supply" ? "archive" : "arrow", 18) + '</span><span class="record-main"><strong>' + escape(item.title) +
    '</strong><span>' + escape(markets[item.market] + " · " + note + stageDate(item.actualIn || item.plannedIn)) + '</span></span>' + icon("right", 17) + '</button>';
}

function operationsPage() {
  return '<div class="two-panels">' +
    section("Поставки", records(state.operations.filter((item) => item.type === "supply").map(operationCard), "Поставок пока нет"), button("Добавить поставку", "operation", "supply", "secondary", "plus")) +
    section("Продвижение", records(state.operations.filter((item) => item.type === "promotion").map(operationCard), "Записей о продвижении пока нет"), button("Добавить размещение", "operation", "promotion", "secondary", "plus")) + '</div>';
}

function schedulesPage() {
  return section("Шаблоны", records(state.schedules.map((item) =>
    '<button type="button" class="record" ' + click("schedule", item.id) + '><span class="record-icon">' + icon("calendar", 19) +
    '</span><span class="record-main"><strong>' + escape(item.title) + '</strong><span>' +
    escape(recurringTypes[item.frequency] + (item.frequency === "weekly" ? " · " + week[item.weekday] : "") + " · " + userName(item.assigneeId)) +
    '</span></span><span class="status ' + (item.active ? "done" : "todo") + '">' + (item.active ? "Активен" : "На паузе") + '</span></button>'),
    "Шаблонов пока нет"), button("Новый шаблон", "schedule", "", "secondary", "plus"));
}

function body() {
  if (view === "overview") return overviewPage();
  if (view === "products") return productsPage();
  if (view === "operations") return operationsPage();
  if (view === "schedules") return schedulesPage();
  return listPage();
}

function options(items, currentValue) {
  return Object.entries(items).map(([value, label]) =>
    '<option value="' + escape(value) + '"' + (String(currentValue) === value ? ' selected' : '') + '>' + escape(label) + '</option>').join("");
}

function select(name, label, items, value, required = false, filter = false) {
  return '<label class="' + (filter ? 'select-filter' : 'field') + '">' + (filter ? '' : escape(label)) +
    '<select name="' + escape(name) + '" aria-label="' + escape(label) + '"' + (required ? " required" : "") + '>' +
    options(items, value) + '</select>' + (filter ? icon("chevron", 15) : "") + '</label>';
}

function input(name, label, value = "", {type = "text", required = false, max = 140, placeholder = ""} = {}) {
  return '<label class="field">' + escape(label) + '<input name="' + escape(name) + '" type="' + type + '" value="' +
    escape(value) + '" maxlength="' + max + '" placeholder="' + escape(placeholder) + '"' + (required ? " required" : "") +
    (type === "date" ? ' min="1900-01-01" max="9999-12-31"' : "") + '></label>';
}
const area = (name, label, value = "", required = false) => '<label class="field">' + escape(label) + '<textarea name="' + name +
  '" rows="3" maxlength="4000"' + (required ? " required" : "") + '>' + escape(value) + '</textarea></label>';
const pair = (...fields) => '<div class="field-grid">' + fields.join("") + '</div>';
const hidden = (name, value) => '<input type="hidden" name="' + name + '" value="' + escape(value) + '">';
const form = (name, fields, submit = "Сохранить") => '<form data-form="' + name + '">' + fields +
  '<p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="submit" class="button primary">' + escape(submit) + '</button></div></form>';
const people = () => ({"": "Выбрать сотрудника", ...Object.fromEntries(users.map((user) => [user.id, user.name + " · " + role(user)]))});
const productOptions = () => ({"": "Выбрать товар", ...Object.fromEntries(state.products.map((item) => [item.id, item.title]))});
const launchOptions = () => ({"": "Без запуска", ...Object.fromEntries(state.launches.map((item) => [item.id, item.title]))});

function open(draw) {
  dialogDraw = draw;
  updateDialog();
  if (!modal.open) modal.showModal();
}
function updateDialog() {
  const {title, content, wide} = dialogDraw();
  modal.classList.toggle("wide", Boolean(wide));
  modal.innerHTML = '<div class="dialog-head"><h2 id="modal-title">' + escape(title) + '</h2><button type="button" class="icon-button" ' +
    click("close") + ' aria-label="Закрыть">' + icon("close") + '</button></div><div class="dialog-body">' + content + '</div>';
  const dialogForm = modal.querySelector("form[data-form]");
  if (dialogForm) dialogForm.dataset.revision = state.revision;
  modal.scrollTop = 0;
}

function showTask(id) {
  open(() => {
    const task = state.tasks.find((item) => item.id === id);
    const taskProduct = state.products.find((item) => item.id === task.productId);
    const isAuthor = task.authorId === current.id;
    const canEdit = !task.archived && task.status !== "done" && (canLead() || (isAuthor && requestStatus(task.status)));
    const canDiscuss = !task.archived && task.status !== "done" && (canLead() || isAuthor || task.assigneeId === current.id);
    const allowed = taskActions(task, current);
    const activity = [...task.history].reverse().map((event) =>
      '<li><strong>' + escape(event.label) + '</strong><span>' + escape(userName(event.actorId) + " · " +
      new Date(event.at).toLocaleString("ru-RU", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})) +
      '</span>' + (event.note ? '<p>' + escape(event.note) + '</p>' : '') + '</li>').join("");
    const files = task.attachments.map((file) => '<li>' + (demo ? escape(file.name) :
      '<a class="inline-link" href="./api/files/' + escape(file.id) + '">' + escape(file.name) + ' ' + icon("download", 15) + '</a>') +
      '<small>' + Math.ceil(file.size / 1024) + ' КБ · ' + escape(userName(file.actorId)) + '</small></li>').join("");
    return {title: task.title, wide: true, content: `
      <div class="detail-badges">${marketTag(task.market)}${badge(task.status)}${task.archived ? '<span class="status todo">В архиве</span>' : ''}</div>
      <dl class="details">${detail("Автор", userName(task.authorId))}${detail("Исполнитель", userName(task.assigneeId))}
      ${detail("Срок", stageDate(task.due))}${detail("Приоритет", priorities[task.priority])}${detail("Категория", categories[task.category])}
      ${detail("Товар", taskProduct?.title)}${detail("Запуск", launchName(task.launchId))}</dl>
      ${task.note ? '<div class="note"><h3>Задача и цель</h3><p>' + escape(task.note) + '</p></div>' : ""}
      ${task.source || task.result ? '<div class="links">' + linkTo(task.source, "Материалы") + linkTo(task.result, "Результат") + '</div>' : ""}
      <div class="dialog-toolbar">
        ${allowed.map((step) => button(transitions[step].label, "transition", id + ":" + step,
          ["approve", "submit", "accept", "resubmit"].includes(step) ? "primary" : "secondary")).join("")}
        ${canEdit ? button("Редактировать", "editTask", id) : ""}
      </div>
      <div class="subsection"><div class="sub-head"><h3>Файлы</h3>${canDiscuss ? '<label class="button secondary file-button">' + icon("upload", 16) + 'Прикрепить файл<input type="file" data-upload="' + escape(id) + '" aria-label="Прикрепить файл"></label>' : ""}</div>
      ${files ? '<ul class="files">' + files + '</ul>' : '<p class="subtle">Файлов пока нет</p>'}</div>
      <div class="subsection"><h3>История и комментарии</h3>${canDiscuss ? form("comment", hidden("id", id) + area("comment", "Комментарий", "", true), "Добавить комментарий") : ""}
      <ul class="timeline">${activity}</ul></div>`};
  });
}

function taskEditor({task, direct = false, preset = {}} = {}) {
  const entry = task || preset;
  const manual = direct || (task && canLead() && !requestStatus(task.status));
  open(() => ({
    title: task ? "Редактировать задачу" : direct ? "Назначить задачу" : "Новая заявка",
    wide: true,
    content: form(task ? "editTask" : "createTask",
      hidden("id", task?.id || "") + (direct ? hidden("direct", "1") : "") +
      input("title", "Название", entry.title || "", {required: true, placeholder: "Например, обновить главное фото"}) +
      area("note", "Что нужно сделать и зачем", entry.note || "") +
      pair(select("market", "Площадка", markets, entry.market || "ozon"), select("category", "Категория", categories, entry.category || "other")) +
      pair(input("due", "Срок", entry.due || "", {type: "date"}), select("priority", "Приоритет", priorities, entry.priority || "normal")) +
      (manual ? select("assigneeId", "Исполнитель", people(), entry.assigneeId || "", true) + queueMarkup(entry.assigneeId) : "") +
      pair(select("productId", "Товар", productOptions(), entry.productId || ""), select("launchId", "Запуск", launchOptions(), entry.launchId || "")) +
      input("source", "Ссылка на материалы", entry.source || "", {type: "url", max: 1500}) +
      (!task && !direct ? '<p class="subtle">Файлы можно приложить сразу после создания заявки.</p>' : ""),
    task ? "Сохранить" : direct ? "Назначить" : "Отправить заявку"),
  }));
}

function queueMarkup(assigneeId) {
  const items = assigneeId ? state.tasks.filter((task) => taskActive(task) && task.assigneeId === assigneeId).sort(taskOrder) : [];
  return '<div class="subsection queue"><h3>Загрузка исполнителя</h3><div id="assignee-queue" class="subtle">' + queueContent(assigneeId, items) + '</div></div>';
}

function queueContent(assigneeId, items) {
  if (!assigneeId) return "Выберите исполнителя, чтобы увидеть его активные задачи.";
  if (!items.length) return "Активных задач нет.";
  return '<ul>' + items.map((task) => '<li>' + escape(task.title + " · " + stageDate(task.due)) + '</li>').join("") + '</ul>';
}

function openTransition(id, step) {
  const task = state.tasks.find((item) => item.id === id);
  const next = transitions[step];
  let fields = "";
  if (step === "approve") {
    fields += select("assigneeId", "Исполнитель", people(), task.assigneeId || "", true) +
      pair(input("due", "Срок", task.due || "", {type: "date"}), select("priority", "Приоритет", priorities, task.priority)) + queueMarkup(task.assigneeId);
  }
  if (next.result) fields += input("result", "Ссылка на результат", task.result, {type: "url", max: 1500});
  if (next.comment || next.result || step === "approve" || step === "resubmit") fields += area("comment", next.comment ? "Что нужно исправить или уточнить" : "Комментарий", "", next.comment);
  if (!fields) { void mutate({action: "transition", id, step}, () => showTask(id)); return; }
  open(() => ({title: next.label, content: form("transition", hidden("id", id) + hidden("step", step) + fields, next.label)}));
}

function productEditor(item) {
  open(() => ({title: item ? "Редактировать товар" : "Новый товар", content: form("product",
    hidden("id", item?.id || "") + input("title", "Название товара", item?.title || "", {required: true, max: 120}) +
    pair(input("ozonSku", "Артикул Ozon", item?.ozonSku || "", {max: 60}), input("wbSku", "Артикул Wildberries", item?.wbSku || "", {max: 60})) +
    input("ozonUrl", "Ссылка на Ozon", item?.ozonUrl || "", {type: "url", max: 1500}) +
    input("wbUrl", "Ссылка на Wildberries", item?.wbUrl || "", {type: "url", max: 1500}))}));
}

function showProduct(id) {
  open(() => {
    const item = state.products.find((row) => row.id === id);
    return {title: item.title, wide: true, content: `<dl class="details">${detail("Артикул Ozon", item.ozonSku)}${detail("Артикул Wildberries", item.wbSku)}</dl>
      <div class="links">${linkTo(item.ozonUrl, "Открыть на Ozon")}${linkTo(item.wbUrl, "Открыть на Wildberries")}</div>
      <div class="dialog-toolbar">${button("Новая заявка", "requestFor", id, "primary", "plus")}
      ${canLead() || item.ownerId === current.id ? button("Редактировать товар", "product", id) : ""}</div>
      <div class="subsection"><h3>История задач по товару</h3>${taskList(state.tasks.filter((task) => task.productId === id), "Заявок по товару пока нет")}</div>`};
  });
}

function launchEditor(item) {
  if (!state.products.length) { setToast("Сначала добавьте товар"); return; }
  open(() => ({title: item ? "Редактировать запуск" : "Новый запуск", content: form("launch",
    hidden("id", item?.id || "") + input("title", "Название запуска", item?.title || "", {required: true, max: 120}) +
    (item ? hidden("productId", item.productId) : select("productId", "Товар", productOptions(), "", true)) +
    pair(input("supply", "План поставки", item?.supply || "", {type: "date", required: true}), input("start", "Старт продаж", item?.start || "", {type: "date", required: true})) +
    (canLead() ? select("coordinatorId", "Координатор", people(), item?.coordinatorId || "", true) : "") +
    area("note", "Зависимости и сдвиги", item?.note || ""))}));
}

function showLaunch(id) {
  open(() => {
    const item = state.launches.find((row) => row.id === id);
    const risks = launchRisks(item, state.tasks, state.operations, today);
    return {title: item.title, wide: true, content: `
      <dl class="details">${detail("Товар", productName(item.productId))}${detail("Координатор", userName(item.coordinatorId))}
      ${detail("План поставки", stageDate(item.supply))}${detail("Старт продаж", stageDate(item.start))}</dl>
      ${risks.length ? '<div class="risk-box"><strong>Риски запуска</strong><ul>' + risks.map((risk) => '<li>' + escape(risk) + '</li>').join("") + '</ul></div>' : ""}
      ${item.note ? '<div class="note"><h3>Зависимости и сдвиги</h3><p>' + escape(item.note) + '</p></div>' : ""}
      <div class="dialog-toolbar">${canLead() ? button("Добавить этап", "stage", id, "primary", "plus") : ""}
      ${canLead() || current.id === item.coordinatorId ? button("Редактировать запуск", "launch", id) : ""}</div>
      <div class="subsection"><h3>Согласования</h3><div class="approval-list">${Object.entries(approvalTypes).map(([key, label]) => {
        const approved = item.approvals[key] === "approved";
        return '<div><strong>' + label + '</strong><span class="status ' + (approved ? "done" : "incoming") + '">' + approvalStatuses[item.approvals[key]] + '</span>' +
          (canLead() ? button(approved ? "Вернуть на согласование" : "Согласовать", "approval", id + ":" + key + ":" + (approved ? "pending" : "approved"), "secondary") : "") + '</div>';
      }).join("")}</div></div>
      <div class="subsection"><h3>Этапы запуска</h3>${taskList(state.tasks.filter((task) => task.launchId === id && !task.archived), "Этапов пока нет")}</div>
      <div class="subsection"><h3>Поставки и продвижение</h3>${records(state.operations.filter((row) => row.launchId === id).map(operationCard), "Связанных записей пока нет")}</div>`};
  });
}

function operationEditor(type, item) {
  const supply = type === "supply";
  open(() => ({title: item ? "Редактировать запись" : supply ? "Новая поставка" : "Новое размещение", content: form("operation",
    hidden("id", item?.id || "") + hidden("type", type) + input("title", "Название", item?.title || "", {required: true}) +
    select("market", "Площадка", markets, item?.market || "ozon") +
    pair(select("productId", "Товар", productOptions(), item?.productId || ""), select("launchId", "Запуск", launchOptions(), item?.launchId || "")) +
    pair(input("plannedOut", supply ? "Отгрузка, план" : "Отправка образца, план", item?.plannedOut || "", {type: "date"}),
      input("actualOut", supply ? "Отгрузка, факт" : "Отправка образца, факт", item?.actualOut || "", {type: "date"})) +
    pair(input("plannedIn", supply ? "Приёмка, план" : "Публикация, план", item?.plannedIn || "", {type: "date"}),
      input("actualIn", supply ? "Приёмка, факт" : "Публикация, факт", item?.actualIn || "", {type: "date"})) +
    input("url", supply ? "Ссылка на поставку" : "Ссылка на публикацию", item?.url || "", {type: "url", max: 1500}) +
    area("note", "Заметка", item?.note || ""))}));
}

function showOperation(id) {
  open(() => {
    const item = state.operations.find((row) => row.id === id);
    const supply = item.type === "supply";
    return {title: item.title, content: `<div class="detail-badges">${marketTag(item.market)}<span class="status todo">${ops[item.type]}</span></div>
      <dl class="details">${detail("Товар", productName(item.productId))}${detail("Запуск", launchName(item.launchId))}
      ${detail(supply ? "Отгрузка, план" : "Отправка образца, план", stageDate(item.plannedOut))}
      ${detail(supply ? "Отгрузка, факт" : "Отправка образца, факт", stageDate(item.actualOut))}
      ${detail(supply ? "Приёмка, план" : "Публикация, план", stageDate(item.plannedIn))}
      ${detail(supply ? "Приёмка, факт" : "Публикация, факт", stageDate(item.actualIn))}</dl>
      ${item.note ? '<div class="note"><p>' + escape(item.note) + '</p></div>' : ""}${linkTo(item.url, supply ? "Открыть поставку" : "Открыть публикацию")}
      <div class="dialog-toolbar">${canLead() || item.ownerId === current.id ? button("Редактировать запись", "operationEdit", id) : ""}</div>`};
  });
}

function scheduleEditor(item, preset = "") {
  const title = preset === "check" ? "Ежедневный чек-лист менеджера" : preset === "report" ? "Отчёт по продажам и расходам" : "";
  const note = preset === "check" ? "Проверить остатки, отзывы, цены и рекламу." : preset === "report" ? "Собрать продажи, возвраты и расходы за период." : "";
  open(() => ({title: item ? "Редактировать шаблон" : "Новый шаблон", content:
    (!item && !preset ? '<div class="dialog-toolbar">' + button("Чек-лист менеджера", "schedulePreset", "check") + button("Отчёт", "schedulePreset", "report") + '</div>' : "") +
    form("schedule", hidden("id", item?.id || "") + input("title", "Название", item?.title || title, {required: true}) +
    area("note", "Чек-лист или содержание отчёта", item?.note || note) +
    pair(select("market", "Площадка", markets, item?.market || "ozon"), select("category", "Категория", categories, item?.category || (preset === "report" ? "report" : "other"))) +
    select("assigneeId", "Исполнитель", people(), item?.assigneeId || "", true) +
    pair(select("frequency", "Расписание", recurringTypes, item?.frequency || (preset === "report" ? "weekly" : "weekdays")),
      select("weekday", "День недели (для еженедельных)", week, item?.weekday ?? 1)) +
    '<label class="checkbox-field"><input type="checkbox" name="active" ' + (item?.active === false ? "" : "checked") + '> Создавать задачи по расписанию</label>')}));
}

function settingsPage() {
  let legacy = null;
  try {
    const previous = JSON.parse(localStorage.getItem("sellerdesk.tasks.v1.browser") || "null");
    if (previous?.tasks?.length) legacy = previous.tasks;
  } catch { /* A missing or unreadable local backup is optional. */ }
  open(() => ({
    title: "Настройки",
    content: `<dl class="details">${detail("Пользователь", current.name)}${detail("Роль", role(current))}</dl>
      ${demo ? '<p class="subtle">Выберите роль, чтобы пройти весь путь заявки в демоверсии.</p>' +
        select("demo-role", "Роль в демоверсии", Object.fromEntries(users.map((user) => [user.id, user.name + " · " + role(user)])), current.id) : ""}
      ${!demo && canLead() ? '<div class="subsection"><h3>Перенос задач из первой версии</h3><p class="subtle">Загрузите JSON-копию из старого трекера. Задачи попадут в вашу очередь.</p><label class="button secondary file-button">' +
        icon("upload", 16) + 'Импортировать JSON<input type="file" id="legacy-file" accept=".json,application/json" aria-label="Импортировать JSON"></label></div>' : ""}
      ${legacy ? '<div class="subsection"><h3>Задачи из старой версии на этом устройстве</h3>' + button("Скачать JSON", "legacyExport", "", "secondary", "download") + '</div>' : ""}
      <div class="dialog-toolbar">${demo ? (!staticMode ? button("Выйти из демоверсии", "exitDemo") : "") : button("Выйти из аккаунта", "logout")}</div>`,
  }));
}

function errorIn(formElement, message) {
  const node = formElement?.querySelector(".form-error");
  if (node) { node.textContent = message; node.hidden = false; }
  else setToast(message);
}

async function refresh() {
  if (demo || !current || working) return;
  const token = ++pollCounter;
  try {
    const next = await api("state");
    if (token !== pollCounter || demo || !current || working) return;
    if (next.state.revision !== state.revision || next.today !== today || JSON.stringify(next.users) !== JSON.stringify(users)) {
      assignSnapshot(next);
      if (view === "schedules" && !canLead()) navigate("overview");
      else if (document.activeElement?.id === "query") refreshRows();
      else render();
    }
  } catch (error) {
    if (error.status === 401 && token === pollCounter && !demo) loginPage("Сессия завершилась. Войдите снова.");
  }
}

async function mutate(payload, onSuccess, sourceForm) {
  if (working) return;
  working = true;
  const submit = sourceForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    let outcome;
    if (demo) {
      const copy = structuredClone(state);
      outcome = command(copy, payload, {user: current, users, today, attachment: payload.demoAttachment});
      materializeSchedules(copy, today);
      state = copy;
    } else {
      const revision = sourceForm?.dataset.revision === undefined ? state.revision : Number(sourceForm.dataset.revision);
      const result = await api("command", {...payload, revision});
      outcome = result.result;
      assignSnapshot(result);
    }
    render();
    if (onSuccess) onSuccess(outcome);
    else if (modal.open) modal.close();
    setToast(payload.action === "importLegacy" ? "Импортировано задач: " + outcome.count : "Изменения сохранены");
  } catch (error) {
    errorIn(sourceForm, error.message);
    if (error.status === 409 && !demo) {
      try {
        assignSnapshot(await api("state"));
        render();
        if (sourceForm && Number(sourceForm.dataset.revision) !== state.revision) {
          errorIn(sourceForm, "Данные изменились. Скопируйте свои правки, закройте форму и откройте её снова.");
        }
      } catch { /* Preserve the form so its values can be copied. */ }
    }
    if (error.status === 401 && !demo) loginPage("Сессия завершилась. Войдите снова.");
  } finally {
    working = false;
    if (submit) submit.disabled = false;
  }
}

async function uploadFile(id, file) {
  if (working || !file) return;
  if (file.size > 8 * 1024 * 1024 || !file.size) { setToast("Файл должен быть от 1 байта до 8 МБ"); return; }
  if (demo) {
    void mutate({action: "attachment", id, demoAttachment: {id: crypto.randomUUID(), name: file.name, size: file.size, actorId: current.id}}, () => showTask(id));
    return;
  }
  working = true;
  try {
    assignSnapshot(await api("tasks/" + encodeURIComponent(id) + "/files?name=" + encodeURIComponent(file.name), file, true));
    render();
    showTask(id);
    setToast("Файл прикреплён");
  } catch (error) {
    setToast(error.message);
    if (error.status === 401) loginPage("Сессия завершилась. Войдите снова.");
  } finally {
    working = false;
  }
}

function downloadLegacy() {
  try {
    const tasks = JSON.parse(localStorage.getItem("sellerdesk.tasks.v1.browser")).tasks;
    const url = URL.createObjectURL(new Blob([JSON.stringify({version: 1, tasks}, null, 2)], {type: "application/json"}));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sellerdesk-old-tasks.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  } catch { setToast("Копия старых задач недоступна"); }
}

async function importLegacy(file) {
  if (!file) return;
  try {
    if (file.size > 3 * 1024 * 1024) throw new Error();
    const backup = JSON.parse(await file.text());
    if (backup.version !== 1 || !Array.isArray(backup.tasks)) throw new Error();
    await mutate({action: "importLegacy", tasks: backup.tasks}, () => navigate("mine"));
  } catch { setToast("Выберите JSON-копию из первой версии трекера"); }
}

const handlers = {
  nav: (value) => navigate(value),
  focus: (value) => navigate("mine", value),
  inboxFocus: (value) => navigate("inbox", value),
  mobileMenu: () => open(() => ({title: "Разделы", content: '<nav class="modal-nav">' + nav() + '</nav>'})),
  settings: settingsPage,
  close: () => modal.close(),
  demo: startDemo,
  exitDemo: () => { if (!staticMode) void loadSession().then(() => { if (modal.open) modal.close(); }); },
  logout: async () => {
    try { await api("logout", {}); loginPage(); } catch (error) { setToast(error.message); }
  },
  market: (value) => {
    market = value;
    document.querySelectorAll('[data-action="market"]').forEach((item) => {
      const selected = item.dataset.value === value;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    refreshRows();
  },
  create: (value) => {
    if (value === "request" || !canLead()) taskEditor();
    else open(() => ({title: "Создать", content: '<div class="dialog-toolbar">' +
      button("Новая заявка", "request", "", "secondary", "plus") + button("Назначить задачу", "direct", "", "primary", "plus") + '</div>'}));
  },
  request: () => taskEditor(),
  direct: () => taskEditor({direct: true}),
  task: showTask,
  editTask: (value) => taskEditor({task: state.tasks.find((task) => task.id === value)}),
  transition: (value) => openTransition(...value.split(":")),
  product: (value) => productEditor(state.products.find((item) => item.id === value)),
  productDetail: showProduct,
  requestFor: (value) => taskEditor({preset: {productId: value, market: state.products.find((item) => item.id === value).ozonSku ? "ozon" : "wb"}}),
  launch: (value) => launchEditor(state.launches.find((item) => item.id === value)),
  launchDetail: showLaunch,
  stage: (value) => {
    const item = state.launches.find((launch) => launch.id === value);
    taskEditor({direct: true, preset: {launchId: value, productId: item.productId, due: item.start,
      market: state.products.find((product) => product.id === item.productId).ozonSku ? "ozon" : "wb"}});
  },
  approval: (value) => {
    const [id, key, next] = value.split(":");
    void mutate({action: "approval", id, key, value: next}, () => showLaunch(id));
  },
  operation: (value) => operationEditor(value),
  operationDetail: showOperation,
  operationEdit: (value) => {
    const item = state.operations.find((row) => row.id === value);
    operationEditor(item.type, item);
  },
  schedule: (value) => scheduleEditor(state.schedules.find((item) => item.id === value)),
  schedulePreset: (value) => scheduleEditor(null, value),
  legacyExport: downloadLegacy,
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) handlers[button.dataset.action]?.(button.dataset.value);
});

document.addEventListener("submit", async (event) => {
  const formElement = event.target;
  const action = formElement.dataset.form;
  if (!action) return;
  event.preventDefault();
  if (working) return;
  const fields = Object.fromEntries(new FormData(formElement));
  if (action === "login") {
    working = true;
    const submit = formElement.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api("login", fields);
      await loadSession();
    } catch (error) { errorIn(formElement, error.message); }
    finally { working = false; submit.disabled = false; }
    return;
  }
  const next = {
    createTask: (task) => {
      navigate(fields.direct ? "mine" : "inbox", fields.direct ? "team" : "sent");
      showTask(task.id);
    },
    editTask: (task) => showTask(task.id),
    transition: (task) => showTask(task.id),
    comment: (task) => showTask(task.id),
    product: (item) => showProduct(item.id),
    launch: (item) => showLaunch(item.id),
    operation: (item) => showOperation(item.id),
  };
  void mutate({...fields, action}, next[action], formElement);
});

document.addEventListener("input", (event) => {
  if (event.target.id === "query") {
    query = event.target.value.trim().toLocaleLowerCase("ru");
    refreshRows();
  }
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.name === "filter-status" || input.name === "filter-person") {
    if (input.name === "filter-status") status = input.value;
    else selectedPerson = input.value;
    refreshRows();
  }
  if (input.name === "demo-role") {
    current = users.find((user) => user.id === input.value);
    navigate("overview");
    setToast("Роль изменена");
  }
  if (input.dataset.upload) void uploadFile(input.dataset.upload, input.files?.[0]);
  if (input.id === "legacy-file") void importLegacy(input.files?.[0]);
  if (input.name === "assigneeId") {
    const queue = modal.querySelector("#assignee-queue");
    if (queue) {
      const tasks = state.tasks.filter((task) => taskActive(task) && task.assigneeId === input.value).sort(taskOrder);
      queue.innerHTML = queueContent(input.value, tasks);
    }
  }
  if (input.name === "launchId" && input.value) {
    const product = input.form?.elements.namedItem("productId");
    if (product) product.value = state.launches.find((item) => item.id === input.value).productId;
  }
});

window.addEventListener("focus", () => void refresh());
setInterval(() => { if (!document.hidden) void refresh(); }, 12_000);
if (params.get("demo") === "1") startDemo();
else void loadSession();
