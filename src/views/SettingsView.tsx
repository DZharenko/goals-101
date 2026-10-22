import { useRef, useState } from "react";
import type { StoreApi } from "../storeApi";
import { exportDoc, parseImported } from "../db";
import {
  getClientId, getToken, logout, setClientId, startOAuth, lastSyncedAt,
  runDiagnostics, type DiagStep,
} from "../sync";

export default function SettingsView({ store }: { store: StoreApi }) {
  const [clientId, setCid] = useState(localStorage.getItem("goals101_ya_clientId") ?? "");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<DiagStep[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <h1>Синхронизация и данные</h1>

      <div className="card">
        <h2>Яндекс.Диск</h2>
        <p className="muted">
          Данные хранятся в файле <b>/101-goals/data.json</b> на вашем Диске.
          Приложение никому не передаёт их — только вам, под вашим аккаунтом.
        </p>
        <label>client_id приложения Яндекс.OAuth</label>
        <input value={clientId} onChange={(e) => setCid(e.target.value)} placeholder="32-символьный id" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={() => { setClientId(clientId); setMsg("client_id сохранён"); }}>Сохранить</button>
          {getToken() ? (
            <>
              <span className="badge done">подключено</span>
              <button className="btn" onClick={() => store.doSync()}>Синхронизировать сейчас</button>
              <button className="btn danger" onClick={() => { logout(); setMsg("Отключено"); }}>Отключить</button>
            </>
          ) : (
            <button className="btn" onClick={() => { setClientId(clientId); startOAuth(); }}>Войти через Яндекс</button>
          )}
        </div>
        {lastSyncedAt() && <p className="muted">Последняя синхронизация: {new Date(lastSyncedAt()!).toLocaleString("ru")}</p>}

        <button
          className="btn secondary"
          disabled={diagBusy}
          onClick={async () => {
            setDiagBusy(true);
            setDiag(null);
            try {
              setDiag(await runDiagnostics());
            } finally {
              setDiagBusy(false);
            }
          }}
        >
          {diagBusy ? "Проверяю…" : "Диагностика синка"}
        </button>
        {diag && (
          <div style={{ marginTop: 10 }}>
            {diag.map((s) => (
              <div className="day-plan-item" key={s.name}>
                <span style={{ flex: 1 }}>{s.name}</span>
                <span className={`badge ${s.ok ? "done" : "failed"}`}>{s.ok ? "OK" : "ПРОБЛЕМА"}</span>
                <span className="muted" style={{ fontSize: 12 }}>{s.detail}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          Как получить client_id: oauth.yandex.ru → «Зарегистрировать новое приложение» →
          платформы: «Веб-сервисы», Redirect URI: адрес этой страницы → доступы:
          Яндекс.Диск REST API (read, write). Скопируйте id в поле выше.
        </p>
      </div>

      <div className="card">
        <h2>Резервные копии</h2>
        <div className="row">
          <button className="btn secondary" onClick={() => exportDoc(store.doc)}>Экспорт JSON</button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>Импорт JSON</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const doc = parseImported(await f.text());
              store.setDocDirect(doc);
              setMsg("Импортировано");
            } catch (err) {
              setMsg("Ошибка импорта: " + (err instanceof Error ? err.message : err));
            }
          }} />
        </div>
        <p className="muted">Экспорт — страховка: файл всегда можно вернуть вручную или перенести на другое облако.</p>
      </div>

      {msg && <div className="toast ok">{msg}</div>}
    </div>
  );
}
