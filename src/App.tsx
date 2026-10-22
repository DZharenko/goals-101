import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import GoalsView from "./views/GoalsView";
import LogView from "./views/LogView";
import DayPlanView from "./views/DayPlanView";
import WorkoutsView from "./views/WorkoutsView";
import ChallengesView from "./views/ChallengesView";
import TasksView from "./views/TasksView";
import SettingsView from "./views/SettingsView";
import SummaryView from "./views/SummaryView";
import { getToken } from "./sync";

type Tab = "goals" | "log" | "day" | "workouts" | "challenges" | "tasks" | "summary" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "goals", label: "Цели" },
  { id: "log", label: "Выполнение" },
  { id: "day", label: "План на день" },
  { id: "workouts", label: "Тренировки" },
  { id: "challenges", label: "Челленджи" },
  { id: "tasks", label: "Задачи" },
  { id: "summary", label: "Итоги" },
  { id: "settings", label: "Синк" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("goals");
  const store = useStore();

  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const goals = store.doc.goals.filter((g) => g.year === year && !g.deleted);
    const done = goals.filter((g) => g.status === "done").length;
    return { total: goals.length, done };
  }, [store.doc]);

  if (!store.loaded) return <div className="empty">Загрузка…</div>;
  window.__APP_BOOTED__ = true;

  return (
    <>
      <div className="syncbar">
        <span>
          {store.syncState
            ? store.syncState.message
            : getToken()
              ? "Синк: авто"
              : "Локальный режим (без облака)"}
        </span>
        <span>
          {stats.done}/{stats.total} целей за год
        </span>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="container">
        {tab === "goals" && <GoalsView store={store} />}
        {tab === "log" && <LogView store={store} />}
        {tab === "day" && <DayPlanView store={store} />}
        {tab === "workouts" && <WorkoutsView store={store} />}
        {tab === "challenges" && <ChallengesView store={store} />}
        {tab === "tasks" && <TasksView store={store} />}
        {tab === "summary" && <SummaryView store={store} />}
        {tab === "settings" && <SettingsView store={store} />}
      </div>
      {store.syncState && store.syncState.status !== "ok" && (
        <Toast message={store.syncState.message} bad={store.syncState.status === "error" || store.syncState.status === "offline"} />
      )}
    </>
  );
}

function Toast({ message, bad }: { message: string; bad: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [message]);
  if (!visible) return null;
  return <div className={`toast ${bad ? "err" : ""}`}>{message}</div>;
}
