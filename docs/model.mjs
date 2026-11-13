export const markets = {ozon: "Ozon", wb: "Wildberries"};
export const categories = {content: "Карточки", supply: "Поставки", ads: "Продвижение", price: "Цены", report: "Отчётность", other: "Другое"};
export const statuses = {
  incoming: "На согласовании", clarify: "На уточнении", todo: "К выполнению",
  doing: "В работе", review: "На проверке", rework: "На доработке", done: "Принято",
};
export const priorities = {high: "Высокий", normal: "Обычный", low: "Низкий"};
export const requestStatus = (status) => status === "incoming" || status === "clarify";
export const taskActive = (task) => !task.archived && task.status !== "done";
export const role = (user) => user.role === "lead" ? "Руководитель" : user.job || "Сотрудник";
export const recurringTypes = {daily: "Каждый день", weekdays: "По будням", weekly: "Раз в неделю"};
export const approvalTypes = {cover: "Обложка и офферы", price: "Стартовая цена", budget: "Бюджет на блогеров"};
export const approvalStatuses = {pending: "На согласовании", approved: "Согласовано"};

export const dateKey = (date = new Date(), timeZone) => {
  if (!timeZone) return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
  const parts = new Intl.DateTimeFormat("en", {timeZone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(date);
  const map = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return [map.year, map.month, map.day].join("-");
};

export function shiftDate(key, delta) {
  const date = new Date(key + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function formatDate(key, options = {day: "numeric", month: "short"}) {
  return key ? new Date(key + "T12:00:00Z").toLocaleDateString("ru-RU", {...options, timeZone: "UTC"}).replace(/\.$/, "") : "—";
}

export const emptyState = () => ({tasks: [], products: [], launches: [], operations: [], schedules: [], revision: 0});
export const person = (users, id) => users.find((user) => user.id === id)?.name || "—";
export const taskOrder = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") ||
  Object.keys(priorities).indexOf(a.priority) - Object.keys(priorities).indexOf(b.priority) || b.updatedAt - a.updatedAt;

export function taskActions(task, user) {
  if (task.archived) return user.role === "lead" || user.id === task.authorId ? ["restore"] : [];
  const lead = user.role === "lead";
  const author = task.authorId === user.id;
  const worker = task.assigneeId === user.id;
  const actions = [];
  if (lead && task.status === "incoming") actions.push("approve", "clarify");
  if (author && task.status === "clarify") actions.push("resubmit");
  if (worker && ["todo", "rework"].includes(task.status)) actions.push("start");
  if (worker && ["todo", "doing", "rework"].includes(task.status)) actions.push("submit");
  if (author && task.status === "review") actions.push("accept", "rework");
  if (lead || author) actions.push("archive");
  return actions;
}

export const transitions = {
  approve: {label: "Утвердить и назначить", status: "todo"},
  clarify: {label: "Запросить уточнение", status: "clarify", comment: true},
  resubmit: {label: "Отправить уточнение", status: "incoming"},
  start: {label: "Взять в работу", status: "doing"},
  submit: {label: "Отправить на проверку", status: "review", result: true},
  accept: {label: "Принять работу", status: "done"},
  rework: {label: "Вернуть на доработку", status: "rework", comment: true},
  archive: {label: "В архив"},
  restore: {label: "Восстановить"},
};

export function overview(state, today) {
  const live = state.tasks.filter(taskActive);
  const conflicts = new Map();
  for (const task of live) {
    if (requestStatus(task.status) || task.status === "review" || !task.assigneeId || !task.due) continue;
    const key = task.assigneeId + "|" + task.due;
    if (!conflicts.has(key)) conflicts.set(key, []);
    conflicts.get(key).push(task);
  }
  return {
    requests: live.filter((task) => requestStatus(task.status)),
    reviews: live.filter((task) => task.status === "review"),
    late: live.filter((task) => task.due && task.due < today),
    conflicts: [...conflicts.values()].filter((group) => group.length > 1).flat(),
    launches: state.launches.filter((launch) => launchRisks(launch, state.tasks, state.operations, today).length),
  };
}

export function launchRisks(launch, tasks, operations, today) {
  const stages = tasks.filter((task) => task.launchId === launch.id && taskActive(task));
  const supplies = operations.filter((row) => row.type === "supply" && row.launchId === launch.id);
  const risks = [];
  if (stages.some((task) => task.due && task.due < today)) risks.push("Есть просроченные этапы");
  if (launch.start && stages.some((task) => task.due > launch.start)) risks.push("Срок этапа позже старта");
  if (supplies.some((row) => !row.actualIn && row.plannedIn && row.plannedIn < today)) risks.push("Поставка задерживается");
  if (launch.start && supplies.some((row) => (row.actualIn || row.plannedIn) > launch.start)) risks.push("Приёмка позже старта");
  if (launch.start && launch.start <= shiftDate(today, 3) && Object.keys(approvalTypes).some((key) => launch.approvals[key] !== "approved")) risks.push("Остались согласования к старту");
  return risks;
}
