import { useMemo, useState } from "react";
import { base, today, type StoreApi } from "../storeApi";

// Задачи вне 101 цели
export default function TasksView({ store }: { store: StoreApi }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);

  const tasks = useMemo(
    () =>
      store.doc.sideTasks
        .filter((t) => !t.deleted)
        .filter((t) => (showDone ? true : !t.done))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [store.doc, showDone]
  );

  return (
    <div>
      <h1>Задачи вне 101 цели</h1>
      <div className="form grid3">
        <div style={{ gridColumn: "span 2" }}>
          <label>Новая задача</label>
          <input value={title} placeholder="Enter — добавить" onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                store.mutate((d) => {
                  d.sideTasks.push({ ...base(), title: title.trim(), done: false, dueDate: due || null, year: new Date().getFullYear(), notes: "" });
                });
                setTitle(""); setDue("");
              }
            }} />
        </div>
        <div>
          <label>Срок</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ margin: "10px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Показывать выполненные
        </label>
      </div>

      {tasks.length === 0 && <div className="empty">Задач нет</div>}

      {tasks.map((t) => (
        <div className="card" key={t.id} style={{ padding: 10 }}>
          <div className="row">
            <input type="checkbox" checked={t.done} onChange={(e) => store.mutate((d) => {
              const task = d.sideTasks.find((x) => x.id === t.id);
              if (task) Object.assign(task, { ...task, updatedAt: new Date().toISOString(), done: e.target.checked });
            })} />
            <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>
              {t.title}
            </span>
            {t.dueDate && <span className="badge">{t.dueDate}</span>}
            {t.dueDate && t.dueDate < today() && !t.done && <span className="badge failed">просрочено</span>}
            <button className="btn small danger" onClick={() => store.mutate((d) => {
              d.sideTasks = d.sideTasks.filter((x) => x.id !== t.id);
            })}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
