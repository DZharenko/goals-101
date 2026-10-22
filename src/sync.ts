// Синхронизация с Яндекс.Диском через REST API (cloud-api.yandex.net).
// OAuth implicit flow (без сервера): https://oauth.yandex.ru/authorize?...
// Протокол: GET data.json -> merge -> HEAD (md5) -> PUT overwrite=true.

import { getDeviceId } from "./db";

const API = "https://cloud-api.yandex.net/v1";
const DISK_PATH = "/101-goals/data.json";

const LS_TOKEN = "goals101_ya_token";
const LS_CLIENT_ID = "goals101_ya_clientId";
const LS_MD5 = "goals101_last_md5";
const LS_SYNCED_AT = "goals101_synced_at";

// ---------- токен / OAuth ----------

export function getToken(): string | null {
  return localStorage.getItem(LS_TOKEN);
}

export function getClientId(): string {
  const id = localStorage.getItem(LS_CLIENT_ID);
  if (!id) throw new Error("client_id Яндекс-приложения не задан (Настройки -> Синк)");
  return id;
}

export function setClientId(id: string) {
  localStorage.setItem(LS_CLIENT_ID, id.trim());
}

export function saveToken(token: string) {
  localStorage.setItem(LS_TOKEN, token);
}

export function logout() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_MD5);
}

// Токен из callback-фрагмента: #access_token=...&expires_in=...
export function captureTokenFromHash(): boolean {
  const m = window.location.hash.match(/access_token=([^&]+)/);
  if (m) {
    saveToken(decodeURIComponent(m[1]));
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return true;
  }
  return false;
}

export function startOAuth() {
  const clientId = getClientId();
  const redirectUri = window.location.origin + window.location.pathname;
  const url =
    `https://oauth.yandex.ru/authorize?response_type=token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=cloud_api:disk.read%20cloud_api:disk.write`;
  window.location.href = url;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  if (!token) throw new Error("Нет токена Яндекс.Диска");
  return { Authorization: `OAuth ${token}` };
}

// ---------- API ----------

// fetch с таймаутом: на мобильных сетях запросы иногда зависают навсегда
async function fetchT(url: string, init?: RequestInit, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchT(API + path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new SyncError("Токен истёк или отозван — нужен повторный вход", 401);
  if (res.status === 429) throw new SyncError("Превышен лимит запросов — подождите минуту", 429);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SyncError(`Яндекс.Диск: ${res.status} ${body.slice(0, 200)}`, res.status);
  }
  return (res.json() ?? (undefined as unknown)) as T;
}

export class SyncError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

interface ResourceInfo {
  path: string;
  md5?: string;
  size?: number;
  mime_type?: string;
}

export async function getDiskFile(): Promise<{ doc: string | null; md5: string | null }> {
  try {
    const info = await api<ResourceInfo>(
      `/disk/resources?path=${encodeURIComponent(DISK_PATH)}&fields=path,md5,size`
    );
    const downloadUrl = await api<{ href: string }>(
      `/disk/resources/download?path=${encodeURIComponent(DISK_PATH)}`
    );
    const res = await fetchT(downloadUrl.href);
    if (!res.ok) throw new SyncError(`Скачивание файла: ${res.status}`);
    const text = await res.text();
    return { doc: text, md5: info.md5 ?? null };
  } catch (e) {
    if (e instanceof SyncError && e.status === 404) return { doc: null, md5: null };
    throw e;
  }
}

async function getUploadUrl(overwrite: boolean): Promise<string> {
  await ensureFolder();
  const r = await api<{ href: string }>(
    `/disk/resources/upload?path=${encodeURIComponent(DISK_PATH)}&overwrite=${overwrite}`
  );
  return r.href;
}

// Создаём папку /101-goals, если её ещё нет (PUT; 409 = уже существует — ок)
async function ensureFolder() {
  const folder = DISK_PATH.slice(0, DISK_PATH.lastIndexOf("/"));
  try {
    await fetchT(
      API + `/disk/resources/?path=${encodeURIComponent(folder)}`,
      { method: "PUT", headers: authHeaders() },
      15000
    );
  } catch {
    // 409 "уже существует" и прочее — не мешает загрузке
  }
}

async function headMd5(): Promise<string | null> {
  try {
    const info = await api<ResourceInfo>(
      `/disk/resources?path=${encodeURIComponent(DISK_PATH)}&fields=md5`
    );
    return info.md5 ?? null;
  } catch {
    return null; // файла нет
  }
}

export async function putDiskFile(text: string, expectedMd5: string | null): Promise<"ok" | "conflict"> {
  // CAS: если файл уже существует, проверяем md5 перед загрузкой
  const currentMd5 = await headMd5();
  if (expectedMd5 !== null || currentMd5 !== null) {
    if (currentMd5 !== expectedMd5) return "conflict";
  }
  const href = await getUploadUrl(true);
  const res = await fetchT(href, { method: "PUT", body: text });
  if (!res.ok) throw new SyncError(`Загрузка файла: ${res.status}`);
  return "ok";
}

export function rememberMd5(md5: string | null) {
  if (md5) localStorage.setItem(LS_MD5, md5);
  else localStorage.removeItem(LS_MD5);
}

export function lastSyncedAt(): string | null {
  return localStorage.getItem(LS_SYNCED_AT);
}

// ---------- диагностика (для телефона: показывает, какой шаг падает) ----------

export interface DiagStep {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDiagnostics(): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  const url = (p: string) => API + p;

  // 1. API доступен вообще (без токена ждём 401 — значит сеть и CORS в порядке)
  try {
    const r = await fetch(url("/disk/"));
    steps.push({
      name: "1. Сеть до cloud-api.yandex.net",
      ok: true,
      detail: `HTTP ${r.status} (401 здесь — норма)`,
    });
  } catch (e) {
    steps.push({
      name: "1. Сеть до cloud-api.yandex.net",
      ok: false,
      detail: `${e instanceof Error ? e.message : String(e)} — нет сети или CORS`,
    });
    return steps; // дальше нет смысла
  }

  // 2. Токен
  const token = getToken();
  if (!token) {
    steps.push({ name: "2. Токен", ok: false, detail: "нет — выполните вход" });
    return steps;
  }
  try {
    const r = await fetch(url("/disk/"), { headers: { Authorization: `OAuth ${token}` } });
    if (r.ok) {
      const j = (await r.json()) as { total_space?: number };
      steps.push({ name: "2. Токен", ok: true, detail: "действителен" });
    } else if (r.status === 401) {
      steps.push({ name: "2. Токен", ok: false, detail: "истёк — нужен повторный вход" });
      return steps;
    } else {
      steps.push({ name: "2. Токен", ok: false, detail: `HTTP ${r.status}` });
    }
  } catch (e) {
    steps.push({ name: "2. Токен", ok: false, detail: String(e) });
  }

  // 3. Папка/файл данных
  try {
    const r = await fetch(
      url(`/disk/resources?path=${encodeURIComponent(DISK_PATH)}&fields=path,md5`),
      { headers: { Authorization: `OAuth ${token}` } }
    );
    steps.push({
      name: "3. Файл данных на Диске",
      ok: r.ok || r.status === 404,
      detail: r.ok ? "существует" : r.status === 404 ? "ещё не создан (создастся при синке)" : `HTTP ${r.status}`,
    });
  } catch (e) {
    steps.push({ name: "3. Файл данных на Диске", ok: false, detail: String(e) });
  }

  // 4. Ссылка на скачивание (JSON отдаётся cloud-api — ок)
  try {
    const r = await fetch(
      url(`/disk/resources/download?path=${encodeURIComponent(DISK_PATH)}`),
      { headers: { Authorization: `OAuth ${token}` } }
    );
    steps.push({
      name: "4. Ссылка на чтение (cloud-api)",
      ok: r.ok || r.status === 404,
      detail: r.ok ? "ссылка выдана" : r.status === 404 ? "файла ещё нет" : `HTTP ${r.status}`,
    });
  } catch (e) {
    steps.push({ name: "4. Ссылка на чтение (cloud-api)", ok: false, detail: String(e) });
  }

  // 5. РЕАЛЬНОЕ скачивание содержимого — отдельный хост (downloader)
  try {
    const dl = await fetch(
      url(`/disk/resources/download?path=${encodeURIComponent(DISK_PATH)}`),
      { headers: { Authorization: `OAuth ${token}` } }
    );
    if (dl.ok) {
      const { href } = (await dl.json()) as { href: string };
      try {
        const r = await fetchT(href);
        const text = r.ok ? await r.text() : "";
        steps.push({
          name: "5. Скачивание файла (хост downloader)",
          ok: r.ok,
          detail: r.ok ? `прочитано ${text.length} байт` : `HTTP ${r.status}`,
        });
      } catch (e) {
        steps.push({
          name: "5. Скачивание файла (хост downloader)",
          ok: false,
          detail: `fetch не прошёл. Ссылка для проверки в адресной строке: ${href}`,
        });
      }
    } else {
      steps.push({ name: "5. Скачивание файла (хост downloader)", ok: false, detail: `нет ссылки: HTTP ${dl.status}` });
    }
  } catch (e) {
    steps.push({ name: "5. Скачивание файла (хост downloader)", ok: false, detail: String(e) });
  }

  // 6. Тестовая запись в отдельный файл (data.json не трогаем)
  const TEST_PATH = "/101-goals/diag-test.txt";
  try {
    const up = await fetch(
      url(`/disk/resources/upload?path=${encodeURIComponent(TEST_PATH)}&overwrite=true`),
      { headers: { Authorization: `OAuth ${token}` } }
    );
    if (up.ok) {
      const { href } = (await up.json()) as { href: string };
      try {
        const r = await fetchT(href, { method: "PUT", body: "diag" });
        steps.push({ name: "6. Запись на Диск (хост uploader)", ok: r.ok, detail: `HTTP ${r.status} (diag-test.txt)` });
      } catch (e) {
        steps.push({
          name: "6. Запись на Диск (хост uploader)",
          ok: false,
          detail: `${e instanceof Error ? e.message : String(e)} — хост не отвечает браузеру`,
        });
      }
    } else {
      steps.push({ name: "6. Запись на Диск (хост uploader)", ok: false, detail: `нет ссылки: HTTP ${up.status}` });
    }
  } catch (e) {
    steps.push({ name: "6. Запись на Диск (хост uploader)", ok: false, detail: String(e) });
  }

  return steps;
}

// ---------- merge ----------

interface Mergeable {
  id: string;
  updatedAt: string;
  deviceId: string;
  deleted?: boolean;
}

// per-record last-write-wins, тай-брейк deviceId — детерминированно
function mergeList<T extends Mergeable>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    if (item.updatedAt > prev.updatedAt) map.set(item.id, item);
    else if (item.updatedAt === prev.updatedAt && item.deviceId > prev.deviceId)
      map.set(item.id, item);
  }
  return [...map.values()];
}

export function mergeDocs(local: import("./schema").DataDoc, remote: import("./schema").DataDoc): import("./schema").DataDoc {
  const merged: import("./schema").DataDoc = {
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion) as 1,
    deviceId: getDeviceId(),
    savedAt: new Date().toISOString(),
    goals: mergeList(local.goals, remote.goals),
    subgoals: mergeList(local.subgoals, remote.subgoals),
    log: mergeList(local.log, remote.log),
    workouts: mergeList(local.workouts, remote.workouts),
    sideTasks: mergeList(local.sideTasks, remote.sideTasks),
    challenges: mergeList(local.challenges, remote.challenges),
    schedule: mergeList(local.schedule, remote.schedule),
    events: mergeList(local.events, remote.events),
  };
  return merged;
}

// ---------- сценарий синка ----------

export interface SyncResult {
  status: "ok" | "busy" | "conflict" | "error" | "offline" | "no-auth";
  message: string;
}

export async function sync(
  loadLocal: () => Promise<import("./schema").DataDoc>,
  saveLocalDoc: (d: import("./schema").DataDoc) => Promise<void>
): Promise<SyncResult> {
  if (!getToken()) return { status: "no-auth", message: "Нет токена — выполните вход в Яндекс" };
  // до 2 попыток: разовые сетевые сбои лечатся коротким повтором
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    try {
      return await syncOnce(loadLocal, saveLocalDoc);
    } catch (e) {
      const offline = e instanceof TypeError;
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const last = attempt === 1;
      if ((offline || aborted) && !last) continue; // повтор через 2 с
      if (aborted)
        return {
          status: "offline",
          message: "Превышено время ожидания (30 с) — данные сохранены локально, попробуйте ещё раз",
        };
      if (offline)
        return {
          status: "offline",
          message: "Нет сети — данные сохранены локально, синк повторится",
        };
      return { status: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }
  return { status: "error", message: "Не удалось синхронизироваться" };
}

async function syncOnce(
  loadLocal: () => Promise<import("./schema").DataDoc>,
  saveLocalDoc: (d: import("./schema").DataDoc) => Promise<void>
): Promise<SyncResult> {
  const local = await loadLocal();
  const remote = await getDiskFile();
  let merged = local;
  let remoteMd5 = remote.md5;
  if (remote.doc) {
    const remoteDoc = JSON.parse(remote.doc) as import("./schema").DataDoc;
    merged = mergeDocs(local, remoteDoc);
  }
  await saveLocalDoc(merged);
  // Пытаемся записать; при конфликте — перечитываем и мерджим ещё раз (1 ретрай)
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await putDiskFile(JSON.stringify(merged), remoteMd5);
    if (result === "ok") {
      rememberMd5(await headMd5());
      localStorage.setItem(LS_SYNCED_AT, new Date().toISOString());
      return { status: "ok", message: "Синхронизировано" };
    }
    // конфликт: перечитать, смёрджить, повторить
    const again = await getDiskFile();
    if (again.doc) merged = mergeDocs(merged, JSON.parse(again.doc));
    remoteMd5 = again.md5;
    await saveLocalDoc(merged);
  }
  return { status: "conflict", message: "Конфликт не разрешился — попробуйте ещё раз" };
}
