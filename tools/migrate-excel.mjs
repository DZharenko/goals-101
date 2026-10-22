// Одноразовая миграция: Цели - 2025.xlsm -> data.json (схема v1).
// Запуск: node tools/migrate-excel.mjs "../Цели - 2025.xlsm" 2025 > data.json
// Перед переносом на Диск: Проверьте отчёт (stderr) и сделайте бэкап.

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";
import * as XLSX from "xlsx";

const [file, yearArg, outFile] = [argv[2], Number(argv[3] || 2025), argv[4]];
if (!file) {
  console.error("Использование: node tools/migrate-excel.mjs <файл.xlsm> [год] [выходной.json]");
  exit(1);
}

const wb = XLSX.read(readFileSync(file), { cellDates: true, type: "buffer" });

const STATUS_MAP = {
  "Выполнено": "done",
  "Выполнена": "done",
  "Начал": "in_progress",
  "В процессе": "in_progress",
  "Не выполнено": "failed",
  "Не выполнена": "failed",
  "Не начато": "not_started",
  "Отложено": "postponed",
  "Убрал": "moved",
};

function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

let gid = 0;
const newId = (p) => `${p}_mig25_${++gid}`;
const now = new Date().toISOString();
const DEVICE = "migration-excel";

const base = () => ({ id: newId("g"), createdAt: now, updatedAt: now, deviceId: DEVICE });

// ---------- Цели: лист "Общая таблица" (таблица Aim_table) ----------
const wsGoals = wb.Sheets["Общая таблица"];
if (!wsGoals) { console.error("Лист 'Общая таблица' не найден"); exit(1); }
const goalsRows = XLSX.utils.sheet_to_json(wsGoals, { header: 1, defval: "" });

// Заголовок ищем в первых 5 строках (по столбцу "Цель")
let headerRowIdx = goalsRows.findIndex((r) => r.some((c) => String(c).trim() === "Цель"));
const header = goalsRows[headerRowIdx].map((c) => String(c).trim());
const col = (name) => header.indexOf(name);

const goals = [];
const subgoals = [];
let skipped = 0;

for (let i = headerRowIdx + 1; i < goalsRows.length; i++) {
  const r = goalsRows[i];
  const title = String(r[col("Цель")] || "").trim();
  if (!title) { skipped++; continue; }
  const area = String(r[col("Область цели")] || "").trim();
  const statusRaw = String(r[col("Статус")] || "").trim();
  const status = STATUS_MAP[statusRaw] ?? "not_started";
  const kind = String(r[col("Количественная/Качественная")] || "").includes("Кач") ? "qualitative" : "quantitative";
  const targetQtyRaw = r[col("Количество")];
  const targetQty = targetQtyRaw === "" || targetQtyRaw == null ? null : num(targetQtyRaw) || null;
  const subgoalText = String(r[col("Подцель")] || "").trim();

  const goal = {
    ...base(),
    year: yearArg,
    area,
    executionBlock: String(r[col("Блок выполнения")] || "").trim(),
    priority: Math.min(3, Math.max(1, num(r[col("Приоритет")]) || 2)),
    title,
    description: String(r[col("Описание")] || "").trim(),
    kind,
    targetQty: kind === "quantitative" ? (targetQty ?? 1) : targetQty,
    status,
    hours: num(r[col("Время (часы)")]),
    cost: num(r[col("Стоимость")]),
    difficulty: Math.min(5, Math.max(1, num(r[col("Сложность")]) || 3)),
    weight: num(r[col("Вес")]) || 1,
    startDate: isoDate(r[col("Дата начала")]),
    forecast: String(r[col("Прогноз")] || "").trim(),
  };
  goals.push(goal);

  // Подцель в Excel — свободный текст; раскладываем по переводам строк / точке с запятой
  if (subgoalText) {
    for (const part of subgoalText.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean)) {
      subgoals.push({
        ...base(),
        goalId: goal.id,
        title: part,
        qty: 1,
        completedQty: 0,
        done: false,
        note: "",
        dueDate: null,
      });
    }
  }
}

// ---------- Выполнение: лист "Выполнение" (таблица Table_CheckAim) ----------
const log = [];
const wsLog = wb.Sheets["Выполнение"];
if (wsLog) {
  const logRows = XLSX.utils.sheet_to_json(wsLog, { header: 1, defval: "" });
  let hIdx = logRows.findIndex((r) => r.some((c) => String(c).trim() === "Дата выполнения"));
  if (hIdx >= 0) {
    const lh = logRows[hIdx].map((c) => String(c).trim());
    const lc = (name) => lh.indexOf(name);
    for (let i = hIdx + 1; i < logRows.length; i++) {
      const r = logRows[i];
      const date = isoDate(r[lc("Дата выполнения")]);
      const title = String(r[lc("Название цели")] || "").trim();
      if (!date || !title) continue;
      // "Выполнено" в Excel — количество зачтённых выполнений
      const qty = Math.max(1, num(r[lc("Выполнено")]) || 1);
      log.push({
        ...base(),
        date,
        goalId: null, // привязка по названию ниже
        title,
        done: true,
        qty,
        comment: String(r[lc("Комментарий")] || "").trim(),
        hours: num(r[lc("Время")]),
      });
    }
  }
}

// Привязка лога к целям по точному совпадению названия
let linked = 0;
for (const l of log) {
  const g = goals.find((x) => x.title === l.title);
  if (g) { l.goalId = g.id; linked++; }
}

// ---------- Отчёт ----------
console.error("=== Отчёт миграции ===");
console.error(`Целей импортировано: ${goals.length} (пропущено пустых строк: ${skipped})`);
console.error(`Подцелей: ${subgoals.length}`);
console.error(`Записей выполнения: ${log.length}, из них привязано к целям: ${linked}`);
const byStatus = {};
for (const g of goals) byStatus[g.status] = (byStatus[g.status] || 0) + 1;
console.error("Статусы:", JSON.stringify(byStatus));

// ---------- Вывод ----------
const doc = {
  schemaVersion: 1,
  deviceId: DEVICE,
  savedAt: now,
  goals,
  subgoals,
  log,
  workouts: [],
  sideTasks: [],
  challenges: [],
  schedule: [],
  events: [],
};
if (outFile) {
  writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf8");
} else {
  process.stdout.write(JSON.stringify(doc, null, 2));
}
