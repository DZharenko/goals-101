import { useMemo, useState } from "react";
import { base, today, type StoreApi } from "../storeApi";

export default function LogView({ store }: { store: StoreApi }) {
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [comment, setComment] = useState("");
  const [hours, setHours] = useState(0);
  const [qty, setQty] = useState(1);

  const entries = useMemo(
    () =>
      store.doc.log
        .filter((l) => !l.deleted && l.date === date)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [store.doc, date]
  );

  const dayTotals = useMemo(() => {
    const h = entries.reduce((a, l) => a + l.hours, 0);
    return { count: entries.length, hours: h };
  }, [entries]);

  const activeGoals = store.doc.goals.filter((g) => !g.deleted && g.status !== "done");

  return (
    <div>
      <h1>Выполнение</h1>
      <div className="form grid3">
        <div><label>Дата</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label>Цель</label>
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">— вне 101 цели —</option>
            {activeGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
        <div><label>Часы</label><input type="number" min={0} step="0.5" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></div>
      </div>
      <div className="form">
        <label>Название (для задач вне 101)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={goalId ? "Берётся из цели" : "Например: разбирались с документами"} />
        <label>Комментарий</label>
        <input value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="grid3">
          <div><label>Количество</label><input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn" onClick={() => {
              const goal = store.doc.goals.find((g) => g.id === goalId);
              const entryTitle = goal ? goal.title : title.trim();
              if (!entryTitle) return;
              store.mutate((d) => {
                d.log.push({ ...base(), date, goalId: goalId || null, title: entryTitle, done: true, qty, comment, hours });
                if (goal && goal.status === "not_started") {
                  const g = d.goals.find((x) => x.id === goal.id);
                  if (g) Object.assign(g, { ...g, updatedAt: new Date().toISOString(), status: "in_progress" });
                }
              });
              setTitle(""); setComment(""); setHours(0); setQty(1);
            }}>Записать</button>
          </div>
        </div>
      </div>

      <h2>{date}: {dayTotals.count} записей, {dayTotals.hours} ч</h2>
      {entries.length === 0 && <div className="empty">Нет записей за этот день</div>}
      {entries.map((l) => (
        <div className="card" key={l.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="title">{l.title}</span>
            <span className="badge done">+{l.qty}</span>
          </div>
          {l.comment && <div className="muted">{l.comment}</div>}
          <div className="row muted">
            {l.hours > 0 && <span>{l.hours} ч</span>}
            <button className="btn small danger" style={{ marginLeft: "auto" }} onClick={() =>
              store.mutate((d) => { d.log = d.log.filter((x) => x.id !== l.id); })
            }>Удалить</button>
          </div>
        </div>
      ))}
    </div>
  );
}
