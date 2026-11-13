import {createServer} from "node:http";
import {createHash, randomBytes, scryptSync, timingSafeEqual} from "node:crypto";
import {mkdirSync, readFileSync, statSync, createReadStream} from "node:fs";
import {dirname, resolve, basename, extname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {emptyState, dateKey} from "./docs/model.mjs";
import {command, materializeSchedules, DomainError} from "./docs/domain.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || resolve(root, "data"));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8080);
const timeZone = process.env.APP_TIMEZONE || "Asia/Novosibirsk";
const origin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : "";
const secure = origin.startsWith("https:");
const sessionLength = 7 * 24 * 60 * 60 * 1000;
const fileLimit = 8 * 1024 * 1024;
const cookieName = secure ? "__Host-sellerdesk" : "sellerdesk";
const publicDir = resolve(root, "docs");
dateKey(new Date(), timeZone);
if (host !== "127.0.0.1" && host !== "::1" && !secure) throw new Error("Для внешнего доступа настройте APP_ORIGIN с HTTPS.");

mkdirSync(dataDir, {recursive: true, mode: 0o700});
const db = new DatabaseSync(resolve(dataDir, "sellerdesk.sqlite"), {timeout: 5000});
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, job TEXT NOT NULL, salt TEXT NOT NULL, secret TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, body BLOB NOT NULL);
`);
db.prepare("INSERT OR IGNORE INTO workspace VALUES (1, ?)").run(JSON.stringify(emptyState()));
const users = () => db.prepare("SELECT id, name, role, job FROM users ORDER BY name COLLATE NOCASE").all();
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
const getState = () => JSON.parse(db.prepare("SELECT body FROM workspace WHERE id = 1").get().body);
const persist = (state) => {
  state.revision += 1;
  db.prepare("UPDATE workspace SET body = ? WHERE id = 1").run(JSON.stringify(state));
};
const fail = (status, message) => { throw new DomainError(message, status); };

function transaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (process.argv[2] === "add-user") {
  const [, , , rawLogin, role, name, job = ""] = process.argv;
  const login = rawLogin?.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(login || "") || !["lead", "member"].includes(role) || !name?.trim() || name.length > 80 || job.length > 80) {
    console.error('node server.mjs add-user login lead|member "Имя" "Должность" < файл_с_паролем');
    process.exit(1);
  }
  const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  if (password.length < 12 || password.length > 200) throw new Error("Пароль должен содержать 12–200 символов.");
  const salt = randomBytes(24).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  transaction(() => {
    db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, job=excluded.job, salt=excluded.salt, secret=excluded.secret`)
      .run(login, name.trim(), role, job.trim(), salt, hash);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(login);
  });
  console.log("Учётная запись сохранена: " + login);
  db.close();
  process.exit(0);
}

const getCookie = (request) => (request.headers.cookie || "").split(/;\s*/).find((item) => item.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || "";
const setCookie = (value, seconds) => cookieName + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + seconds + (secure ? "; Secure" : "");
const auth = (request) => {
  const cookie = getCookie(request);
  if (!/^[a-f0-9]{64}$/.test(cookie)) return null;
  return db.prepare(`SELECT users.id, name, role, job FROM sessions JOIN users ON user_id = users.id
    WHERE token = ? AND expires > ?`).get(tokenHash(cookie), Date.now());
};
const json = (response, status, data) => {
  response.writeHead(status, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"});
  response.end(JSON.stringify(data));
};
async function readBody(request, max) {
  if (Number(request.headers["content-length"]) > max) {
    request.resume();
    fail(413, "Размер превышает допустимый предел");
  }
  const chunks = [];
  let length = 0;
  let over = false;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > max) over = true;
    else if (!over) chunks.push(chunk);
  }
  if (over) fail(413, "Размер превышает допустимый предел");
  return Buffer.concat(chunks, length);
}
async function readJson(request, max = 80 * 1024) {
  if (!request.headers["content-type"]?.startsWith("application/json")) fail(415, "Ожидается JSON");
  const body = await readBody(request, max);
  let data;
  try { data = JSON.parse(body.toString("utf8")); } catch { fail(400, "Некорректный JSON"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, "Ожидается объект JSON");
  return data;
}
const types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"};
const allowedFiles = new Set(["index.html", "styles.css", "app.mjs", "model.mjs", "domain.mjs", "demo.mjs", "mark.svg"]);
const attempts = new Map();
let limitTime = 0;
let limitCount = 0;

function tick() {
  return transaction(() => {
    const state = getState();
    const today = dateKey(new Date(), timeZone);
    if (materializeSchedules(state, today)) persist(state);
    return {state, today};
  });
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const method = request.method;
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/") && method === "POST") {
      const expected = origin || "http://" + request.headers.host;
      if (request.headers.origin !== expected) fail(403, "Откройте приложение по настроенному адресу");
    }

    if (pathname === "/api/login" && method === "POST") {
      const payload = await readJson(request, 4096);
      const login = typeof payload.login === "string" ? payload.login.trim().toLowerCase() : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      const now = Date.now();
      const account = /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(login) ? db.prepare("SELECT * FROM users WHERE id = ?").get(login) : null;
      if (now - limitTime > 60_000) { limitCount = 0; limitTime = now; }
      const entry = account && attempts.get(login);
      if (limitCount >= 80 || (entry?.count >= 12 && now - entry.at < 10 * 60_000)) fail(429, "Слишком много попыток. Попробуйте позже");
      limitCount += 1;
      if (password.length > 200 || password.length < 12) fail(401, "Проверьте логин и пароль");
      const candidate = scryptSync(password, account?.salt || "sellerdesk-invalid", 64);
      const secret = Buffer.from(account?.secret || "00".repeat(64), "hex");
      if (!timingSafeEqual(candidate, secret) || !account) {
        if (account) attempts.set(login, {at: entry && now - entry.at < 10 * 60_000 ? entry.at : now, count: entry && now - entry.at < 10 * 60_000 ? entry.count + 1 : 1});
        fail(401, "Проверьте логин и пароль");
      }
      attempts.delete(login);
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(tokenHash(token), account.id, now + sessionLength);
      response.setHeader("Set-Cookie", setCookie(token, sessionLength / 1000));
      return json(response, 200, {ok: true});
    }

    if (pathname.startsWith("/api/")) {
      const user = auth(request);
      if (!user) fail(401, "Войдите в рабочее пространство");
      if (pathname === "/api/logout" && method === "POST") {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash(getCookie(request)));
        response.setHeader("Set-Cookie", setCookie("", 0));
        return json(response, 200, {ok: true});
      }
      if (pathname === "/api/state" && method === "GET") return json(response, 200, {...tick(), user, users: users(), timeZone});
      if (pathname === "/api/command" && method === "POST") {
        const payload = await readJson(request, 3 * 1024 * 1024);
        if (payload.action === "attachment") fail(400, "Используйте загрузку файлов");
        const result = transaction(() => {
          const state = getState();
          if (payload.revision !== state.revision) fail(409, "Данные изменились. Обновите форму и повторите действие");
          const today = dateKey(new Date(), timeZone);
          const outcome = command(state, payload, {user, users: users(), today});
          materializeSchedules(state, today);
          persist(state);
          return {state, result: outcome, today};
        });
        return json(response, 200, result);
      }
      const upload = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]{1,90})\/files$/);
      if (upload && method === "POST") {
        const name = new URL(request.url, "http://localhost").searchParams.get("name")?.trim();
        if (!name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name)) fail(400, "Проверьте имя файла");
        const buffer = await readBody(request, fileLimit);
        if (!buffer.length) fail(400, "Файл пуст");
        const id = randomBytes(20).toString("hex");
        const attachment = {id, name, size: buffer.length, actorId: user.id};
        const result = transaction(() => {
          const state = getState();
          const today = dateKey(new Date(), timeZone);
          command(state, {action: "attachment", id: upload[1]}, {user, users: users(), attachment, today});
          db.prepare("INSERT INTO files VALUES (?, ?, ?)").run(id, name, buffer);
          persist(state);
          return {state, today};
        });
        return json(response, 200, result);
      }
      const download = pathname.match(/^\/api\/files\/([a-f0-9]{40})$/);
      if (download && method === "GET") {
        const file = db.prepare("SELECT name, body FROM files WHERE id = ?").get(download[1]);
        if (!file) fail(404, "Файл не найден");
        response.writeHead(200, {"Content-Type": "application/octet-stream", "Cache-Control": "no-store",
          "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))});
        return response.end(file.body);
      }
      fail(404, "Маршрут не найден");
    }

    if (!["GET", "HEAD"].includes(method)) fail(405, "Метод не поддерживается");
    const name = pathname === "/" ? "index.html" : basename(pathname);
    if (!allowedFiles.has(name) || (pathname !== "/" && pathname !== "/" + name)) fail(404, "Страница не найдена");
    const path = resolve(publicDir, name);
    response.writeHead(200, {"Content-Type": types[extname(name)], "Content-Length": statSync(path).size, "Cache-Control": "no-cache"});
    if (method === "HEAD") return response.end();
    createReadStream(path).pipe(response);
  } catch (error) {
    if (!(error instanceof DomainError)) console.error(error);
    if (!response.headersSent && !response.destroyed) json(response, error.status || 500, {error: error.status ? error.message : "Ошибка сервера"});
  }
});

server.requestTimeout = 60_000;
server.listen(port, host, () => console.log("Селлер CRM: " + (origin || "http://" + host + ":" + port)));
const timer = setInterval(() => {
  try {
    tick();
    db.prepare("DELETE FROM sessions WHERE expires <= ?").run(Date.now());
  } catch (error) { console.error(error); }
}, 60_000);
timer.unref();
