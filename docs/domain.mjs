import {markets, categories, priorities, recurringTypes, approvalTypes, approvalStatuses,
  taskActions, transitions, requestStatus, shiftDate} from "./model.mjs";

export class DomainError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const check = (condition, message, status) => { if (!condition) throw new DomainError(message, status); };
const text = (value, max, label, required = false) => {
  const result = typeof value === "string" ? value.trim() : "";
  check(result.length <= max && (!required || result), "Проверьте поле «" + label + "»");
  return result;
};
const option = (value, options, label) => {
  check(typeof value === "string" && Object.hasOwn(options, value), "Выберите " + label);
  return value;
};
const date = (value, required = false) => {
  if (!value && !required) return "";
  check(typeof value === "string" && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value), "Укажите корректную дату");
  const parsed = new Date(value + "T12:00:00Z");
  check(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, "Укажите корректную дату");
  return value;
};
const link = (value) => {
  const result = text(value, 1500, "Ссылка");
  if (!result) return "";
  try { check(["http:", "https:"].includes(new URL(result).protocol), "Укажите ссылку HTTP или HTTPS"); }
  catch { throw new DomainError("Укажите ссылку HTTP или HTTPS"); }
  return result;
};
const find = (items, id, message = "Запись не найдена") => {
  const result = items.find((item) => item.id === id);
  check(result, message, 404);
  return result;
};

export function command(state, payload, context) {
  check(payload && typeof payload === "object" && !Array.isArray(payload), "Некорректная команда");
  const {user, users, now = Date.now(), id = () => crypto.randomUUID()} = context;
  const lead = user.role === "lead";
  const member = (value, required = false) => {
    if (!value && !required) return "";
    return find(users, value, "Исполнитель не найден").id;
  };
  const requireLead = () => check(lead, "Действие доступно руководителю", 403);
  const event = (label, note = "") => ({id: id(), actorId: user.id, at: now, label, note});
  const touch = (task, label, note) => {
    task.history.push(event(label, note));
    task.updatedAt = now;
  };
  const related = (value, records, message) => value ? find(records, value, message).id : "";
  const taskFields = (input, existing) => {
    const market = option(input.market, markets, "площадку");
    const launchId = related(input.launchId, state.launches, "Запуск не найден");
    const productId = related(input.productId, state.products, "Товар не найден");
    if (launchId) {
      const launch = find(state.launches, launchId);
      check(launch.productId === productId, "Выберите товар этого запуска");
    }
    return {
      title: text(input.title, 140, "Название", true),
      note: text(input.note, 4000, "Задача и цель"), market,
      category: option(input.category, categories, "категорию"),
      due: date(input.due), priority: option(input.priority || "normal", priorities, "приоритет"),
      productId, launchId, source: link(input.source),
      result: link(input.result ?? existing?.result),
    };
  };

  if (payload.action === "createTask") {
    const direct = Boolean(payload.direct);
    if (direct) requireLead();
    const task = {...taskFields(payload), id: id(), authorId: user.id,
      assigneeId: direct ? member(payload.assigneeId, true) : "",
      status: direct ? "todo" : "incoming", kind: direct ? "task" : "request", archived: false, attachments: [], history: []};
    touch(task, direct ? "Задача назначена" : "Заявка создана");
    state.tasks.unshift(task);
    return task;
  }

  if (["editTask", "transition", "comment", "attachment"].includes(payload.action)) {
    const task = find(state.tasks, payload.id);
    const author = task.authorId === user.id;
    const worker = task.assigneeId === user.id;
    if (payload.action === "comment" || payload.action === "attachment") {
      check(!task.archived && task.status !== "done", "Карточка закрыта для изменений", 409);
      check(lead || author || worker, "Действие доступно участникам задачи", 403);
      if (payload.action === "comment") touch(task, "Комментарий", text(payload.comment, 2500, "Комментарий", true));
      else {
        check(context.attachment, "Файл не передан");
        check(task.attachments.length < 20, "В карточке уже 20 файлов");
        task.attachments.push(context.attachment);
        touch(task, "Прикреплён файл", context.attachment.name);
      }
    } else if (payload.action === "editTask") {
      check(!task.archived && task.status !== "done" && (lead || (author && requestStatus(task.status))),
        "Редактирование задачи недоступно", 403);
      const fields = taskFields(payload, task);
      if (!lead) fields.priority = task.priority;
      Object.assign(task, fields);
      if (lead && !requestStatus(task.status)) task.assigneeId = member(payload.assigneeId, true);
      touch(task, "Параметры обновлены");
    } else {
      const step = payload.step;
      check(taskActions(task, user).includes(step), "Переход сейчас недоступен", 409);
      const transition = transitions[step];
      const comment = text(payload.comment, 2500, "Комментарий", transition.comment);
      if (step === "approve") {
        task.assigneeId = member(payload.assigneeId, true);
        task.due = date(payload.due);
        task.priority = option(payload.priority, priorities, "приоритет");
      }
      if (step === "submit") {
        task.result = link(payload.result);
        check(task.result || task.attachments.some((file) => file.actorId === user.id) || comment,
          "Добавьте ссылку, файл результата или комментарий о выполнении");
      }
      if (step === "archive" || step === "restore") task.archived = step === "archive";
      else task.status = transition.status;
      touch(task, transition.label, comment);
    }
    return task;
  }

  if (payload.action === "product") {
    check(lead || !payload.id || find(state.products, payload.id).ownerId === user.id, "Действие доступно автору или руководителю", 403);
    const fields = {
      title: text(payload.title, 120, "Товар", true), ozonSku: text(payload.ozonSku, 60, "Артикул Ozon"),
      wbSku: text(payload.wbSku, 60, "Артикул Wildberries"), ozonUrl: link(payload.ozonUrl), wbUrl: link(payload.wbUrl),
    };
    check(fields.ozonSku || fields.wbSku, "Укажите хотя бы один артикул");
    check(!state.products.some((item) => item.id !== payload.id &&
      ["ozonSku", "wbSku"].some((key) => fields[key] && item[key].toLowerCase() === fields[key].toLowerCase())),
      "Товар с таким артикулом уже существует", 409);
    if (payload.id) return Object.assign(find(state.products, payload.id), fields);
    const item = {...fields, id: id(), ownerId: user.id};
    state.products.unshift(item);
    return item;
  }

  if (payload.action === "launch") {
    const old = payload.id ? find(state.launches, payload.id) : null;
    check(lead || old?.coordinatorId === user.id, "Действие доступно руководителю или координатору", 403);
    const productId = find(state.products, payload.productId, "Выберите товар").id;
    check(!old || old.productId === productId, "Товар запуска уже закреплён");
    const item = {id: old?.id || id(), productId, title: text(payload.title, 120, "Название запуска", true),
      start: date(payload.start, true), supply: date(payload.supply, true),
      coordinatorId: lead ? member(payload.coordinatorId, true) : old.coordinatorId,
      note: text(payload.note, 2500, "Зависимости и сдвиги"),
      approvals: old?.approvals || Object.fromEntries(Object.keys(approvalTypes).map((key) => [key, "pending"])),
    };
    if (old) return Object.assign(old, item);
    state.launches.unshift(item);
    return item;
  }

  if (payload.action === "approval") {
    requireLead();
    const launch = find(state.launches, payload.id);
    launch.approvals[option(payload.key, approvalTypes, "согласование")] = option(payload.value, approvalStatuses, "статус");
    return launch;
  }

  if (payload.action === "operation") {
    const old = payload.id ? find(state.operations, payload.id) : null;
    check(!old || lead || old.ownerId === user.id, "Запись доступна автору или руководителю", 403);
    const type = option(payload.type, {supply: true, promotion: true}, "тип");
    const productId = related(payload.productId, state.products, "Товар не найден");
    const launchId = related(payload.launchId, state.launches, "Запуск не найден");
    if (launchId) check(find(state.launches, launchId).productId === productId, "Выберите товар этого запуска");
    const fields = {id: old?.id || id(), ownerId: old?.ownerId || user.id, type,
      title: text(payload.title, 140, "Название", true), market: option(payload.market, markets, "площадку"),
      productId, launchId, plannedOut: date(payload.plannedOut), actualOut: date(payload.actualOut),
      plannedIn: date(payload.plannedIn), actualIn: date(payload.actualIn), url: link(payload.url),
      note: text(payload.note, 2500, "Заметка"),
    };
    if (old) return Object.assign(old, fields);
    state.operations.unshift(fields);
    return fields;
  }

  if (payload.action === "schedule") {
    requireLead();
    const old = payload.id ? find(state.schedules, payload.id) : null;
    const frequency = option(payload.frequency, recurringTypes, "расписание");
    const weekdays = {1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 0: true};
    const fields = {
      id: old?.id || id(), authorId: old?.authorId || user.id, title: text(payload.title, 140, "Название", true),
      note: text(payload.note, 4000, "Чек-лист или содержание отчёта"),
      market: option(payload.market, markets, "площадку"), category: option(payload.category, categories, "категорию"),
      assigneeId: member(payload.assigneeId, true), frequency,
      weekday: frequency === "weekly" ? Number(option(String(payload.weekday), weekdays, "день недели")) : 1,
      active: Boolean(payload.active), lastRun: old?.active ? old.lastRun : "",
      createdOn: old?.active ? old.createdOn : context.today,
    };
    if (old) return Object.assign(old, fields);
    state.schedules.unshift(fields);
    return fields;
  }

  if (payload.action === "importLegacy") {
    requireLead();
    check(Array.isArray(payload.tasks) && payload.tasks.length <= 1000, "Некорректная копия");
    let count = 0;
    for (const old of payload.tasks) {
      const originalId = text(old?.id, 64, "ID", true);
      const legacyId = user.id + ":" + originalId;
      if (state.tasks.some((task) => task.legacyId === legacyId)) continue;
      const task = {...taskFields({...old, source: "", result: "", productId: "", launchId: ""}), id: id(),
        legacyId, kind: "task", authorId: user.id, assigneeId: user.id, archived: Boolean(old.archived),
        status: option(old.status, {todo: true, doing: true, done: true}, "статус"),
        attachments: [], history: []};
      touch(task, "Перенесено из предыдущей версии");
      state.tasks.unshift(task);
      count += 1;
    }
    return {count};
  }

  throw new DomainError("Команда не найдена", 404);
}

export function materializeSchedules(state, today, now = Date.now()) {
  let changed = false;
  for (const schedule of state.schedules) {
    if (!schedule.active || schedule.lastRun >= today) continue;
    const from = schedule.lastRun ? shiftDate(schedule.lastRun, 1) : schedule.createdOn;
    for (let day = from > shiftDate(today, -30) ? from : shiftDate(today, -30); day <= today; day = shiftDate(day, 1)) {
      const weekday = new Date(day + "T12:00:00Z").getUTCDay();
      if (schedule.frequency === "weekdays" && (weekday === 0 || weekday === 6)) continue;
      if (schedule.frequency === "weekly" && weekday !== schedule.weekday) continue;
      const id = schedule.id + "-" + day;
      if (state.tasks.some((task) => task.id === id)) continue;
      state.tasks.unshift({id, title: schedule.title, note: schedule.note, market: schedule.market, category: schedule.category,
        due: day, priority: "normal", authorId: schedule.authorId, assigneeId: schedule.assigneeId, status: "todo",
        archived: false, kind: "task", productId: "", launchId: "", source: "", result: "", attachments: [],
        history: [{id, actorId: schedule.authorId, at: now, label: "Создано по расписанию", note: ""}], updatedAt: now});
    }
    schedule.lastRun = today;
    changed = true;
  }
  return changed;
}
