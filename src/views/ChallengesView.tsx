import { useMemo, useState } from "react";
import { base, today, type StoreApi } from "../storeApi";
import { challengeStreak, type Challenge } from "../schema";

export default function ChallengesView({ store }: { store: StoreApi }) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(30);
  const [desc, setDesc] = useState("");

  const challenges = useMemo(
    () => store.doc.challenges.filter((c) => !c.deleted).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [store.doc]
  );

  return (
    <div>
      <h1>Челленджи</h1>
      <div className="card">
        <div className="form">
          <div className="grid3">
            <div><label>Название</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="30 дней без сахара" />
            </div>
            <div><label>Дней</label>
              <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn" onClick={() => {
                if (!title.trim()) return;
                store.mutate((d) => {
                  d.challenges.push({
                    ...base(), title: title.trim(), description: desc,
                    targetDays: days, startDate: today(), endDate: null,
                    status: "active", checkDays: [],
                  });
                  d.events.push({ ...base(), type: "challenge_created", date: today(), entity: title, payload: JSON.stringify({ days }) });
                });
                setTitle(""); setDesc("");
              }}>Создать</button>
            </div>
          </div>
          <label>Описание</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>

      {challenges.length === 0 && <div className="empty">Нет челленджей</div>}

      {challenges.map((c) => (
        <ChallengeCard key={c.id} c={c} store={store} />
      ))}
    </div>
  );
}

function ChallengeCard({ c, store }: { c: Challenge; store: StoreApi }) {
  const streak = challengeStreak(c);
  const isToday = c.checkDays.includes(today());

  const toggleToday = () => store.mutate((d) => {
    const ch = d.challenges.find((x) => x.id === c.id);
    if (!ch) return;
    const t = today();
    if (ch.checkDays.includes(t)) ch.checkDays = ch.checkDays.filter((x) => x !== t);
    else ch.checkDays.push(t);
    Object.assign(ch, { ...ch, updatedAt: new Date().toISOString() });
    d.events.push({ ...base(), type: "challenge_checked", date: t, entity: c.id, payload: JSON.stringify({ on: ch.checkDays.includes(t) }) });
  });

  const finish = (status: "completed" | "failed") => store.mutate((d) => {
    const ch = d.challenges.find((x) => x.id === c.id);
    if (ch) Object.assign(ch, { ...ch, updatedAt: new Date().toISOString(), status, endDate: today() });
    d.events.push({ ...base(), type: "challenge_finished", date: today(), entity: c.id, payload: JSON.stringify({ status }) });
  });

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">{c.title}</span>
        <span className={`badge ${c.status === "active" ? "in_progress" : c.status === "completed" ? "done" : "failed"}`}>
          {c.status === "active" ? "Активен" : c.status === "completed" ? "Завершён ✓" : "Провален"}
        </span>
      </div>
      {c.description && <div className="muted">{c.description}</div>}
      <div className="progressbar"><div style={{ width: `${Math.min(100, Math.round((c.checkDays.length / c.targetDays) * 100))}%` }} /></div>
      <div className="row muted">
        <span>{c.checkDays.length} / {c.targetDays} дней</span>
        <span>Серия: {streak.current} (рекорд {streak.best})</span>
      </div>
      {c.status === "active" && (
        <div className="row" style={{ marginTop: 6 }}>
          <button className={`btn small ${isToday ? "secondary" : ""}`} onClick={toggleToday}>
            {isToday ? "Отменить сегодня" : "Сегодня выполнено ✓"}
          </button>
          <button className="btn small secondary" onClick={() => finish("completed")}>Завершить</button>
          <button className="btn small danger" onClick={() => finish("failed")}>Провалить</button>
        </div>
      )}
    </div>
  );
}
