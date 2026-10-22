import { useMemo, useState } from "react";
import type { StoreApi } from "../storeApi";
import type { DataDoc, GoalStatus } from "../schema";

// Пороги из Excel («Подведение итогов»): сумма весов выполненных целей
const POINTS_SCALE = [
  { min: 739, label: "Удовлетворительно (минимум)" },
  { min: 886.8, label: "Хорошо" },
  { min: 1034.6, label: "Отлично" },
  { min: 1182.4, label: "Превосходно" },
  { min: 1330.2, label: "Великолепно" },
  { min: 1478, label: "Ты бог" },
];
// % выполненных изначальных целей
const PERCENT_SCALE = [
  { min: 60, label: "Удовлетворительно" },
  { min: 70, label: "Хорошо" },
  { min: 80, label: "Отлично" },
  { min: 90, label: "Превосходно" },
  { min: 100, label: "Идеально" },
];

function rate(value: number, scale: { min: number; label: string }[]): string {
  let label = "Пока не дотянули";
  for (const s of scale) if (value >= s.min) label = s.label;
  return label;
}

export default function SummaryView({ store }: { store: StoreApi }) {
  const years = useMemo(
    () => [...new Set(store.doc.goals.map((g) => g.year))].sort((a, b) => b - a),
    [store.doc]
  );
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());

  const goals = store.doc.goals.filter((g) => g.year === year && !g.deleted);

  const byStatus = useMemo(() => {
    const r: Record<GoalStatus, number> = {
      done: 0, failed: 0, not_started: 0, in_progress: 0, postponed: 0, moved: 0,
    };
    for (const g of goals) r[g.status]++;
    return r;
  }, [goals]);

  const points = goals.filter((g) => g.status === "done").reduce((a, g) => a + g.weight, 0);
  const total = goals.length;
  const percent = total ? Math.round((byStatus.done / total) * 100) : 0;

  const byArea = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const g of goals) {
      const key = g.area || "Без области";
      const cur = m.get(key) ?? { done: 0, total: 0 };
      cur.total++;
      if (g.status === "done") cur.done++;
      m.set(key, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [goals]);

  const hoursByYear = useMemo(() => {
    const h = new Map<number, number>();
    for (const l of store.doc.log) {
      if (l.deleted || !l.date) continue;
      const y = Number(l.date.slice(0, 4));
      h.set(y, (h.get(y) ?? 0) + l.hours);
    }
    return h;
  }, [store.doc]);

  const compare = years.map((y) => {
    const gs = store.doc.goals.filter((g) => g.year === y && !g.deleted);
    const done = gs.filter((g) => g.status === "done").length;
    return { y, done, total: gs.length, pct: gs.length ? Math.round((done / gs.length) * 100) : 0 };
  });

  return (
    <div>
      <h1>Итоги</h1>
      <div className="form">
        <label>Год</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Оценка года</h2>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span>Баллы (Σ весов выполненных)</span>
          <b>{points}</b>
        </div>
        <div className="muted">{rate(points, POINTS_SCALE)} — шкала: 739 / 887 / 1035 / 1182 / 1330 / 1478</div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <span>Выполнено изначальных целей</span>
          <b>{byStatus.done} / {total} ({percent}%)</b>
        </div>
        <div className="muted">{rate(percent, PERCENT_SCALE)} — шкала: 60 / 70 / 80 / 90 / 100%</div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Статусы</h2>
        <div className="day-plan-item"><span style={{ flex: 1 }}>Выполнено</span><b>{byStatus.done}</b></div>
        <div className="day-plan-item"><span style={{ flex: 1 }}>Не доделано (в процессе / отложено)</span><b>{byStatus.in_progress + byStatus.postponed}</b></div>
        <div className="day-plan-item"><span style={{ flex: 1 }}>Не выполнено</span><b>{byStatus.failed}</b></div>
        <div className="day-plan-item"><span style={{ flex: 1 }}>Не начато</span><b>{byStatus.not_started}</b></div>
        <div className="day-plan-item"><span style={{ flex: 1 }}>Убрано из года</span><b>{byStatus.moved}</b></div>
        <div className="day-plan-item"><span style={{ flex: 1 }}><b>Общий итог</b></span><b>{total}</b></div>
        {(hoursByYear.get(year) ?? 0) > 0 && (
          <div className="day-plan-item"><span style={{ flex: 1 }}>Часов по логу выполнения</span><b>{hoursByYear.get(year)}</b></div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>По областям</h2>
        {byArea.map(([area, s]) => (
          <div key={area}>
            <div className="row muted" style={{ justifyContent: "space-between" }}>
              <span>{area}</span>
              <span>{s.done} / {s.total}</span>
            </div>
            <div className="progressbar">
              <div style={{ width: `${s.total ? Math.round((s.done / s.total) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Сравнение по годам</h2>
        <div className="day-plan-item"><b>Год</b><b>Выполнено</b><b>Всего</b><b>%</b></div>
        {compare.map((c) => (
          <div className="day-plan-item" key={c.y} style={{ opacity: c.y === year ? 1 : 0.6 }}>
            <span style={{ flex: 1 }}>{c.y}</span>
            <span>{c.done}</span>
            <span>{c.total}</span>
            <span>{c.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { DataDoc };
