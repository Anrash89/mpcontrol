import {dateKey, shiftDate, emptyState} from "./model.mjs";

export const demoUsers = [
  {id: "lead", name: "Илья", role: "lead"},
  {id: "ozon", name: "Анна", role: "member", job: "Менеджер Ozon"},
  {id: "design", name: "Мария", role: "member", job: "Дизайнер"},
  {id: "log", name: "Алексей", role: "member", job: "Логист"},
  {id: "wb", name: "Екатерина", role: "member", job: "Менеджер Wildberries"},
];

export function demoState() {
  const state = emptyState();
  const today = dateKey();
  const when = (days) => shiftDate(today, days);
  const now = Date.now();
  state.products = [
    {id: "organizer", title: "Органайзер для кухни", ozonSku: "OZ-1842", wbSku: "WB-50318", ozonUrl: "", wbUrl: "", ownerId: "ozon"},
    {id: "boxes", title: "Набор контейнеров", ozonSku: "", wbSku: "WB-88541", ozonUrl: "", wbUrl: "", ownerId: "wb"},
  ];
  state.launches = [{id: "first", productId: "organizer", title: "Органайзер · старт продаж", supply: when(-1), start: when(2),
    coordinatorId: "ozon", note: "После приёмки сверить остатки и подтвердить дату старта.", approvals: {cover: "pending", price: "approved", budget: "pending"}}];
  state.operations = [
    {id: "supply-1", ownerId: "log", type: "supply", title: "Поставка на склад Казань", market: "ozon", productId: "organizer", launchId: "first",
      plannedOut: when(-3), actualOut: when(-3), plannedIn: when(-1), actualIn: "", url: "", note: "Ждём приёмку на складе."},
    {id: "promo-1", ownerId: "wb", type: "promotion", title: "Обзор набора контейнеров", market: "wb", productId: "boxes", launchId: "",
      plannedOut: today, actualOut: "", plannedIn: when(5), actualIn: "", url: "", note: "Подготовить образец и согласовать дату выхода."},
  ];
  const rows = [
    ["cover", "Обновить главное фото органайзера", "ozon", "content", "incoming", "high", 0, "ozon", "", "organizer", "first", "Заменить главное фото. Сделать товар крупнее и показать, как он выглядит в ящике."],
    ["price", "Проверить стартовую цену", "ozon", "price", "review", "normal", 0, "lead", "ozon", "organizer", "first", "Сверить цену с плановой маржой перед стартом продаж."],
    ["sample", "Подготовить образец для блогера", "wb", "ads", "doing", "normal", 1, "wb", "log", "boxes", "", "Упаковать набор и передать в доставку."],
    ["receiving", "Подтвердить приёмку в Казани", "ozon", "supply", "doing", "high", -1, "ozon", "log", "organizer", "first", "Проверить поставку и обновить план запуска."],
    ["photos", "Внести правки в инфографику", "wb", "content", "rework", "high", 1, "wb", "design", "boxes", "", "Увеличить подписи и добавить размеры контейнеров."],
    ["layout", "Подготовить баннер к запуску", "ozon", "content", "todo", "normal", 1, "lead", "design", "organizer", "first", "Собрать баннер и проверить текст оффера."],
    ["report", "Собрать отчёт по расходам", "wb", "report", "todo", "normal", 2, "lead", "design", "boxes", "", "Собрать расходы на контент и продвижение."],
    ["details", "Уточнить комплектацию", "wb", "content", "clarify", "normal", 3, "wb", "", "boxes", "", "Проверить, сколько предметов указано в карточке."],
    ["sku", "Сверить артикулы и ссылки", "ozon", "other", "done", "low", -2, "ozon", "ozon", "organizer", "first", "Проверить рабочие ссылки на карточки."],
  ];
  state.tasks = rows.map(([id, title, market, category, status, priority, days, authorId, assigneeId, productId, launchId, note]) => ({
    id, title, market, category, status, priority, due: when(days), authorId, assigneeId, productId, launchId, note,
    kind: ["cover", "photos", "details", "sku"].includes(id) ? "request" : "task", source: "", result: "", archived: false, attachments: [], updatedAt: now,
    history: [{id: id + "-history", actorId: authorId, label: "Задача создана", at: now - 86_400_000,
      note: id === "photos" ? "На телефоне мелко читаются размеры. Увеличить подписи." : ""}],
  }));
  state.schedules = [
    {id: "check", title: "Ежедневный чек-лист Ozon", note: "Проверить остатки, отзывы, цены и рекламу.", market: "ozon",
      category: "other", authorId: "lead", assigneeId: "ozon", frequency: "weekdays", weekday: 1, active: true, lastRun: today, createdOn: today},
    {id: "cost", title: "Отчёт по продажам и расходам Wildberries", note: "Собрать продажи, возвраты и расходы за неделю.",
      market: "wb", category: "report", authorId: "lead", assigneeId: "wb", frequency: "weekly", weekday: 1, active: true, lastRun: today, createdOn: today},
  ];
  return state;
}
