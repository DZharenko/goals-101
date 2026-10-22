import { useMemo, useState } from "react";
import { base, touch, today, type StoreApi } from "../storeApi";
import {
  SUGGESTED_AREAS, STATUS_LABELS, goalProgress, goalLoggedQty,
  type Goal, type GoalStatus, type Subgoal, type DataDoc,
} from "../schema";

interface Props { store: StoreApi; }

export default function GoalsView({ store }: Props) {
  const years = useMemo(
    () => [...new Set(store.doc.goals.map((g) => g.year))].sort((a, b) => b - a),
    [store.doc]
  );
  const year = years.includes(new Date().getFullYear())
    ? new Date().getFullYear()
    : (years[0] ?? new Date().getFullYear());
  const [area, setArea] = useState<string>("all");
  const [status, setStatus] = useState<GoalStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);

  const areas = useMemo(
    () => [...new Set(store.doc.goals.filter((g) => g.year === year && g.area).map((g) => g.area))].sort(),
    [store.doc, year]
  );

  const goals = useMemo(
    () =>
      store.doc.goals
        .filter((g) => g.year === year && !g.deleted)
        .filter((g) => (area === "all" ? true : g.area === area))
        .filter((g) => (status === "all" ? true : g.status === status))
        .filter((g) =>
          search ? g.title.toLowerCase().includes(search.toLowerCase()) : true
        )
        .sort((a, b) => a.area.localeCompare(b.area) || a.priority - b.priority),
    [store.doc, area, status, search, year]
  );

  return (
    <div>
      <h1>Цели {year}</h1>
      <div className="form grid3" style={{ marginBottom: 12 }}>
        <div>
          <input placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="all">Все области</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus | "all")}>
          <option value="all">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <button className="btn" onClick={() => setEditing("new")}>+ Добавить цель</button>

      {goals.length === 0 && <div className="empty">Нет целей по фильтру</div>}

      {goals.map((g) => (
        <GoalCard key={g.id} goal={g} doc={store.doc} onEdit={() => setEditing(g)} store={store} />
      ))}

      {editing && (
        <GoalEditor
          initial={editing === "new" ? null : editing}
          year={year}
          doc={store.doc}
          onClose={() => setEditing(null)}
          onSave={(goal, subgoals) => {
            store.mutate((d) => {
              const i = d.goals.findIndex((x) => x.id === goal.id);
              if (i >= 0) d.goals[i] = goal;
              else d.goals.push(goal);
              d.subgoals = d.subgoals.filter((s) => s.goalId !== goal.id);
              d.subgoals.push(...subgoals);
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, doc, onEdit, store }: { goal: Goal; doc: DataDoc; onEdit: () => void; store: StoreApi }) {
  const [open, setOpen] = useState(false);
  const subs = doc.subgoals.filter((s) => s.goalId === goal.id && !s.deleted);
  const progress = goalProgress(goal, doc.subgoals);
  const logged = goalLoggedQty(goal.id, doc.log);

  const setStatusQuick = (status: GoalStatus) => {
    store.mutate((d) => {
      const g = d.goals.find((x) => x.id === goal.id);
      if (g) Object.assign(g, touch(g), { status });
      d.events.push({ ...base(), type: "goal_status_changed", date: today(), entity: goal.id, payload: JSON.stringify({ oldStatus: goal.status, newStatus: status }) });
    });
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">{goal.title}</span>
        <span className={`badge ${goal.status}`}>{STATUS_LABELS[goal.status]}</span>
      </div>
      <div className="row muted">
        {goal.area && <span className="badge">{goal.area}</span>}
        {goal.executionBlock && <span className="badge">{goal.executionBlock}</span>}
        <span>Приоритет {goal.priority}</span>
        {goal.kind === "quantitative" && goal.targetQty != null && (
          <span>Выполнено: {Math.max(logged, subs.reduce((a, s) => a + s.completedQty, 0))} / {goal.targetQty}</span>
        )}
        {goal.hours > 0 && <span>{goal.hours} ч</span>}
        {goal.cost > 0 && <span>{goal.cost} ₽</span>}
      </div>
      {progress !== null && (
        <div className="progressbar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        {goal.kind === "quantitative" && (
          <button className="btn small" onClick={() => store.mutate((d) => {
            d.log.push({ ...base(), date: today(), goalId: goal.id, title: goal.title, done: true, qty: 1, comment: "", hours: 0 });
            const g = d.goals.find((x) => x.id === goal.id);
            if (g && g.status === "not_started") Object.assign(g, touch(g), { status: "in_progress" });
            d.events.push({ ...base(), type: "log_added", date: today(), entity: goal.id, payload: JSON.stringify({ qty: 1 }) });
          })}>+1 выполнение</button>
        )}
        <button className="btn small secondary" onClick={() => setOpen(!open)}>
          {open ? "Скрыть подцели" : `Подцели (${subs.length})`}
        </button>
        {goal.status !== "done" && <button className="btn small secondary" onClick={() => setStatusQuick("done")}>Выполнено ✓</button>}
        <button className="btn small secondary" onClick={onEdit}>Изменить</button>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {subs.length === 0 && <div className="muted">Нет подцелей. Добавьте через «Изменить».</div>}
          {subs.map((s) => (
            <div className="subgoal" key={s.id}>
              <input
                type="checkbox"
                checked={s.completedQty >= s.qty}
                onChange={(e) => store.mutate((d) => {
                  const sub = d.subgoals.find((x) => x.id === s.id);
                  if (sub) {
                    const done = e.target.checked;
                    Object.assign(sub, touch(sub), { completedQty: done ? sub.qty : 0, done });
                    d.events.push({ ...base(), type: "subgoal_completed", date: today(), entity: s.id, payload: JSON.stringify({ done, title: sub.title }) });
                  }
                })}
              />
              <span style={{ flex: 1, textDecoration: s.completedQty >= s.qty ? "line-through" : "none", opacity: s.completedQty >= s.qty ? 0.6 : 1 }}>
                {s.title}
              </span>
              {s.dueDate && <span className="muted">{s.dueDate}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalEditor({
  initial, year, doc, onClose, onSave,
}: {
  initial: Goal | null; year: number; doc: DataDoc;
  onClose: () => void; onSave: (goal: Goal, subgoals: Subgoal[]) => void;
}) {
  const [goal, setGoal] = useState<Goal>(
    initial ?? {
      ...base(), year, area: "", executionBlock: "", priority: 2,
      title: "", description: "", kind: "quantitative", targetQty: 1,
      status: "not_started", hours: 0, cost: 0, difficulty: 3, weight: 1,
      startDate: null, forecast: "",
    }
  );
  const [subs, setSubs] = useState<Subgoal[]>(
    initial ? doc.subgoals.filter((s) => s.goalId === initial.id && !s.deleted).map((s) => ({ ...s })) : []
  );
  const [newSub, setNewSub] = useState("");

  const set = (patch: Partial<Goal>) => setGoal((g) => ({ ...g, ...patch }));

  return (
    <div className="card" style={{ border: "1px solid var(--accent)" }}>
      <h2>{initial ? "Изменить цель" : "Новая цель"}</h2>
      <div className="form">
        <label>Название</label>
        <input value={goal.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
        <div className="grid2">
          <div>
            <label>Область</label>
            <input list="areas-list" value={goal.area} onChange={(e) => set({ area: e.target.value })} />
            <datalist id="areas-list">
              {SUGGESTED_AREAS.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div>
            <label>Блок выполнения</label>
            <input value={goal.executionBlock} onChange={(e) => set({ executionBlock: e.target.value })} />
          </div>
        </div>
        <div className="grid3">
          <div>
            <label>Приоритет</label>
            <select value={goal.priority} onChange={(e) => set({ priority: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>1 (высший)</option><option value={2}>2</option><option value={3}>3</option>
            </select>
          </div>
          <div>
            <label>Тип</label>
            <select value={goal.kind} onChange={(e) => set({ kind: e.target.value as "quantitative" | "qualitative" })}>
              <option value="quantitative">Количественная</option>
              <option value="qualitative">Качественная</option>
            </select>
          </div>
          <div>
            <label>Количество</label>
            <input type="number" min={1} value={goal.targetQty ?? ""} onChange={(e) => set({ targetQty: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        <div className="grid3">
          <div>
            <label>Часы</label>
            <input type="number" min={0} step="0.5" value={goal.hours} onChange={(e) => set({ hours: Number(e.target.value) })} />
          </div>
          <div>
            <label>Стоимость, ₽</label>
            <input type="number" min={0} value={goal.cost} onChange={(e) => set({ cost: Number(e.target.value) })} />
          </div>
          <div>
            <label>Сложность 1-5</label>
            <input type="number" min={1} max={5} value={goal.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })} />
          </div>
        </div>
        <label>Описание</label>
        <textarea rows={2} value={goal.description} onChange={(e) => set({ description: e.target.value })} />
        <label>Подцели (книги, этапы — прогресс по каждой + общий по цели)</label>
        {subs.map((s, i) => (
          <div className="subgoal" key={s.id}>
            <input value={s.title} onChange={(e) => setSubs((arr) => { arr[i] = { ...s, title: e.target.value }; return [...arr]; })} />
            <button className="btn small danger" onClick={() => setSubs((arr) => arr.filter((x) => x.id !== s.id))}>✕</button>
          </div>
        ))}
        <div className="subgoal">
          <input placeholder="Новая подцель…" value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSub.trim()) {
                setSubs((arr) => [...arr, { ...base(), goalId: goal.id, title: newSub.trim(), qty: 1, completedQty: 0, done: false, note: "", dueDate: null }]);
                setNewSub("");
              }
            }} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => onSave(touch(goal), subs)} disabled={!goal.title.trim()}>Сохранить</button>
        <button className="btn secondary" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
