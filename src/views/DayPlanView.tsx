import { useMemo, useState } from "react";
import { base, today, type StoreApi } from "../storeApi";

const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// «План на день» = проекция расписания на выбранную дату + задачи с dueDate.
export default function DayPlanView({ store }: { store: StoreApi }) {
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [dow, setDow] = useState<number | "once">(null as unknown as number);

  const dowOfDate = new Date(date).getDay();

  const slots = useMemo(
    () =>
      store.doc.schedule
        .filter((s) => !s.deleted && s.active)
        .filter((s) =>
          (s.specificDate === date) ||
          (s.specificDate === null && s.dayOfWeek === dowOfDate)
        )
        .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99")),
    [store.doc, date, dowOfDate]
  );

  const dayLog = store.doc.log.filter((l) => !l.deleted && l.date === date);
  const dayWorkouts = store.doc.workouts.filter((w) => !w.deleted && w.date === date);

  return (
    <div>
      <h1>План на день</h1>
      <div className="form grid3">
        <div><label>Дата</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label>Время (новый слот)</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div><label>Повторение</label>
          <select value={dow ?? -1} onChange={(e) => {
            const v = e.target.value;
            setDow(v === "" ? "once" : Number(v));
          }}>
            <option value={dowOfDate}>Разово ({DOW[dowOfDate]})</option>
            {DOW.map((d, i) => <option key={i} value={i}>Каждый {d}</option>)}
          </select>
        </div>
      </div>
      <div className="form">
        <label>Что запланировать (тренировка, цель, дело)</label>
        <input value={title} onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            store.mutate((d) => {
              d.schedule.push({
                ...base(), title: title.trim(), goalId: null, workoutId: null,
                dayOfWeek: dow === "once" || dow == null ? null : dow,
                specificDate: dow === "once" || dow == null ? date : null,
                time: time || null, durationMin: null, active: true,
              });
            });
            setTitle("");
          }
        }} onChange={(e) => setTitle(e.target.value)} placeholder="Enter — добавить" />
      </div>

      <h2>Расписание на {date} ({DOW[dowOfDate]})</h2>
      {slots.length === 0 && <div className="empty">Ничего не запланировано</div>}
      {slots.map((s) => (
        <div className="day-plan-item" key={s.id}>
          {s.time && <span className="time-chip">{s.time}</span>}
          <span style={{ flex: 1 }}>{s.title}</span>
          {s.specificDate === null && <span className="badge">еженедельно</span>}
          <button className="btn small secondary" onClick={() => store.mutate((d) => {
            const slot = d.schedule.find((x) => x.id === s.id);
            if (slot) Object.assign(slot, { ...slot, updatedAt: new Date().toISOString(), active: !slot.active });
          })}>{s.active ? "Скрыть" : "Вернуть"}</button>
          <button className="btn small danger" onClick={() => store.mutate((d) => {
            d.schedule = d.schedule.filter((x) => x.id !== s.id);
          })}>✕</button>
        </div>
      ))}

      {dayWorkouts.length > 0 && (
        <>
          <h2>Тренировки этого дня</h2>
          {dayWorkouts.map((w) => (
            <div className="card" key={w.id}>
              <span className="title">{w.title}</span>
              <span className="muted"> — {w.exercises.length} упражнений</span>
            </div>
          ))}
        </>
      )}

      {dayLog.length > 0 && (
        <>
          <h2>Выполнено в этот день</h2>
          {dayLog.map((l) => (
            <div className="day-plan-item" key={l.id}>
              <span style={{ flex: 1 }}>{l.title}</span>
              {l.hours > 0 && <span className="badge">{l.hours} ч</span>}
              <span className="badge done">+{l.qty}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
