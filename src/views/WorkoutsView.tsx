import { useMemo, useState } from "react";
import { base, touch, today, type StoreApi } from "../storeApi";
import type { Exercise, Workout } from "../schema";

export default function WorkoutsView({ store }: { store: StoreApi }) {
  const [editing, setEditing] = useState<Workout | "new" | null>(null);

  const workouts = useMemo(
    () => store.doc.workouts.filter((w) => !w.deleted).sort((a, b) => b.date.localeCompare(a.date)),
    [store.doc]
  );

  const goals = store.doc.goals.filter((g) => !g.deleted && g.status !== "done");

  return (
    <div>
      <h1>Тренировки</h1>
      <button className="btn" onClick={() => setEditing("new")}>+ Записать тренировку</button>
      {workouts.length === 0 && <div className="empty">Пока нет тренировок</div>}

      {workouts.map((w) => (
        <div className="card" key={w.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="title">{w.title}</span>
            <span className="badge">{w.date}</span>
          </div>
          {w.exercises.map((ex, i) => (
            <div className="row muted" key={i} style={{ paddingLeft: 12 }}>
              <span style={{ flex: 1 }}>{ex.name}</span>
              <span>{ex.sets}×{ex.reps}{ex.loadKg ? ` @${ex.loadKg}кг` : ""}</span>
            </div>
          ))}
          {w.comment && <div className="muted">{w.comment}</div>}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small secondary" onClick={() => setEditing(w)}>Изменить</button>
            <button className="btn small danger" onClick={() => store.mutate((d) => {
              d.workouts = d.workouts.filter((x) => x.id !== w.id);
            })}>Удалить</button>
          </div>
        </div>
      ))}

      {editing && (
        <WorkoutEditor
          initial={editing === "new" ? null : editing}
          goals={goals}
          onClose={() => setEditing(null)}
          onSave={(w) => {
            store.mutate((d) => {
              const i = d.workouts.findIndex((x) => x.id === w.id);
              if (i >= 0) d.workouts[i] = w;
              else {
                d.workouts.push(w);
                if (w.goalId) d.log.push({ ...base(), date: w.date, goalId: w.goalId, title: w.title, done: true, qty: 1, comment: "Тренировка", hours: 1 });
              }
              d.events.push({ ...base(), type: "workout_logged", date: w.date, entity: w.id, payload: JSON.stringify({ exercises: w.exercises.length }) });
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WorkoutEditor({ initial, goals, onClose, onSave }: {
  initial: Workout | null; goals: { id: string; title: string }[];
  onClose: () => void; onSave: (w: Workout) => void;
}) {
  const [w, setW] = useState<Workout>(
    initial ?? { ...base(), date: today(), goalId: null, title: "Тренировка", comment: "", exercises: [] }
  );
  const [newEx, setNewEx] = useState<Exercise>({ name: "", sets: 3, reps: 10, loadKg: null, comment: "" });

  const set = (patch: Partial<Workout>) => setW((x) => ({ ...x, ...patch }));

  return (
    <div className="card" style={{ border: "1px solid var(--accent)" }}>
      <h2>{initial ? "Изменить тренировку" : "Новая тренировка"}</h2>
      <div className="form grid3">
        <div><label>Дата</label><input type="date" value={w.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div><label>Название</label><input value={w.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div><label>Связать с целью</label>
          <select value={w.goalId ?? ""} onChange={(e) => set({ goalId: e.target.value || null })}>
            <option value="">— без цели —</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
      </div>

      <h2>Упражнения</h2>
      {w.exercises.map((ex, i) => (
        <div className="exercise-row" key={i}>
          <input value={ex.name} onChange={(e) => set({ exercises: w.exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
          <input type="number" min={1} value={ex.sets} onChange={(e) => set({ exercises: w.exercises.map((x, j) => j === i ? { ...x, sets: Number(e.target.value) } : x) })} />
          <input type="number" min={1} value={ex.reps} onChange={(e) => set({ exercises: w.exercises.map((x, j) => j === i ? { ...x, reps: Number(e.target.value) } : x) })} />
          <input type="number" min={0} value={ex.loadKg ?? ""} placeholder="кг" onChange={(e) => set({ exercises: w.exercises.map((x, j) => j === i ? { ...x, loadKg: e.target.value ? Number(e.target.value) : null } : x) })} />
          <button className="btn small danger" onClick={() => set({ exercises: w.exercises.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <div className="exercise-row" style={{ marginTop: 6 }}>
        <input placeholder="Новое упражнение" value={newEx.name} onChange={(e) => setNewEx({ ...newEx, name: e.target.value })} />
        <input type="number" min={1} value={newEx.sets} title="подходы" onChange={(e) => setNewEx({ ...newEx, sets: Number(e.target.value) })} />
        <input type="number" min={1} value={newEx.reps} title="повторы" onChange={(e) => setNewEx({ ...newEx, reps: Number(e.target.value) })} />
        <input type="number" min={0} placeholder="кг" value={newEx.loadKg ?? ""} onChange={(e) => setNewEx({ ...newEx, loadKg: e.target.value ? Number(e.target.value) : null })} />
        <button className="btn small" onClick={() => {
          if (!newEx.name.trim()) return;
          set({ exercises: [...w.exercises, newEx] });
          setNewEx({ name: "", sets: 3, reps: 10, loadKg: null, comment: "" });
        }}>+</button>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>Формат: название | подходы | повторы | вес</div>

      <label style={{ marginTop: 10 }}>Комментарий</label>
      <input value={w.comment} onChange={(e) => set({ comment: e.target.value })} />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => onSave(touch(w))} disabled={w.exercises.length === 0 && !initial}>Сохранить</button>
        <button className="btn secondary" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
