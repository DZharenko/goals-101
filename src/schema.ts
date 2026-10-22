// Схема данных v1. Один JSON-документ data.json на Яндекс.Диске.
// Правила: плоские массивы, каждая запись с id/updatedAt/deviceId,
// вложенность только через ссылки (parentId/goalId), события append-only.

export type DeviceId = string;
export type IsoDate = string; // "2026-10-21"
export type IsoDateTime = string; // "2026-10-21T12:34:56.789Z"

export type GoalStatus =
  | "not_started"
  | "in_progress"
  | "done"
  | "failed"
  | "postponed"
  | "moved"; // убрана из года / в резерв

// Область цели — свободный текст (как в Excel), меняется от года к году.
// Подсказки для UI — исторические значения из файлов 2022-2025:
export const SUGGESTED_AREAS = [
  "Здоровье", "Бег/Цикл", "Зал", "Другой спорт", "Програмирование", "Путешествия",
  "Развлечения", "Финансы", "Чтение", "Дом", "Машина", "Стиль", "Python", "Курсы",
  "Общее", "Испытание", "Бюджет", "Заработок", "Подушка", "Квартира", "Бег",
  "Баня", "Сноуборд", "Техника", "Макросы", "Внешний вид", "Самолет",
];

export const STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "Не начато",
  in_progress: "В процессе",
  done: "Выполнено",
  failed: "Не выполнено",
  postponed: "Отложено",
  moved: "Убрана из года",
};

export interface Base {
  id: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deviceId: DeviceId;
  deleted?: boolean; // tombstone для merge
}

export interface Goal extends Base {
  year: number;
  area: string; // свободный текст, см. SUGGESTED_AREAS
  executionBlock: string; // "Блок выполнения" из Excel, свободный текст
  priority: 1 | 2 | 3;
  title: string;
  description: string;
  kind: "quantitative" | "qualitative";
  targetQty: number | null; // для количественных: сколько раз/штук
  status: GoalStatus;
  hours: number; // плановое время
  cost: number; // стоимость
  difficulty: 1 | 2 | 3 | 4 | 5;
  weight: number; // вес для расчёта итогов
  startDate: IsoDate | null;
  forecast: string;
}

// Подцель: книга в цели "10 книг", участок кольца и т.п.
// Прогресс цели = Σ(completedQty по подцелям) / targetQty, если есть подцели.
export interface Subgoal extends Base {
  goalId: string;
  title: string;
  qty: number; // сколько засчитывает (обычно 1)
  completedQty: number; // 0..qty
  done: boolean;
  note: string;
  dueDate: IsoDate | null;
}

// Запись лога выполнения ("Выполнение" в Excel)
export interface LogEntry extends Base {
  date: IsoDate;
  goalId: string | null; // null => задача вне 101 цели
  title: string; // название цели/задачи на момент выполнения (для истории)
  done: boolean;
  qty: number; // сколько засчитано
  comment: string;
  hours: number;
}

// Тренировка ("Зал 50 силовых тренировок", воркаут и т.д.)
export interface Workout extends Base {
  date: IsoDate;
  goalId: string | null;
  title: string;
  comment: string;
  exercises: Exercise[];
}

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  loadKg: number | null;
  comment: string;
}

// Задачи вне 101 цели
export interface SideTask extends Base {
  title: string;
  done: boolean;
  dueDate: IsoDate | null;
  year: number;
  notes: string;
}

// Челлендж: "30 дней без...", серии дней
export interface Challenge extends Base {
  title: string;
  description: string;
  targetDays: number;
  startDate: IsoDate;
  endDate: IsoDate | null;
  status: "active" | "completed" | "failed" | "planned";
  checkDays: IsoDate[]; // дни, в которых отметка есть
}

// Расписание: повторяющиеся и разовые слоты; "План на день" = проекция по дате
export interface ScheduleSlot extends Base {
  title: string;
  goalId: string | null;
  workoutId: string | null;
  dayOfWeek: number | null; // 0=вс..6=сб, для повторяющихся
  specificDate: IsoDate | null; // для разовых
  time: string | null; // "07:00"
  durationMin: number | null;
  active: boolean;
}

// Тайм-трекинг "Часы и блоки": часы уже в LogEntry.hours, здесь сводок нет —
// блок = area/executionBlock, вычисляется из лога.

// Append-only события для полной истории и merge
export type EventType =
  | "goal_created"
  | "goal_status_changed"
  | "goal_edited"
  | "subgoal_completed"
  | "log_added"
  | "log_edited"
  | "workout_logged"
  | "challenge_created"
  | "challenge_checked"
  | "challenge_finished";

export interface EventRecord extends Base {
  type: EventType;
  date: IsoDate;
  entity: string; // id цели/подцели/лога/челленджа
  payload: string; // JSON-строка с деталями (comment, oldStatus, newStatus...)
}

export interface DataDoc {
  schemaVersion: 1;
  deviceId: DeviceId; // устройство, последним сохранившее файл
  savedAt: IsoDateTime;
  goals: Goal[];
  subgoals: Subgoal[];
  log: LogEntry[];
  workouts: Workout[];
  sideTasks: SideTask[];
  challenges: Challenge[];
  schedule: ScheduleSlot[];
  events: EventRecord[];
}

export function emptyDataDoc(deviceId: DeviceId): DataDoc {
  return {
    schemaVersion: 1,
    deviceId,
    savedAt: new Date().toISOString(),
    goals: [],
    subgoals: [],
    log: [],
    workouts: [],
    sideTasks: [],
    challenges: [],
    schedule: [],
    events: [],
  };
}

export function goalProgress(goal: Goal, subgoals: Subgoal[]): number | null {
  const subs = subgoals.filter((s) => s.goalId === goal.id && !s.deleted);
  if (subs.length === 0) return null;
  const target = goal.targetQty ?? subs.reduce((a, s) => a + s.qty, 0);
  if (!target) return null;
  const done = subs.reduce((a, s) => a + s.completedQty, 0);
  return Math.min(1, done / target);
}

export function goalLoggedQty(goalId: string, log: LogEntry[]): number {
  return log
    .filter((l) => l.goalId === goalId && !l.deleted && l.done)
    .reduce((a, l) => a + l.qty, 0);
}

export function challengeStreak(ch: Challenge): { current: number; best: number } {
  const days = [...new Set(ch.checkDays)].sort();
  if (days.length === 0) return { current: 0, best: 0 };
  let best = 1,
    run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = Math.round((+cur - +prev) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  // current: серия, доходящая до сегодня/вчера
  const today = new Date();
  const last = new Date(days[days.length - 1]);
  const diffToToday = Math.round(
    (+today.setHours(0, 0, 0, 0) - +last.setHours(0, 0, 0, 0)) / 86400000
  );
  let current = 0;
  if (diffToToday <= 1) {
    current = run;
  }
  return { current, best };
}
