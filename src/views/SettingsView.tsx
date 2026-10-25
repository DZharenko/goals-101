import { useRef, useState } from "react";
import type { StoreApi } from "../storeApi";
import { exportDoc, parseImported } from "../db";
import {
  getClientId, getToken, logout, setClientId, startOAuth, lastSyncedAt,
  runDiagnostics, type DiagStep,
  getBackend, setBackend, ghRepo, setGhRepo, getGhToken, setGhToken, ghLogout,
  getGhLogin,
} from "../sync";

// Делает URL внутри текста кликабельными
function renderDetail(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function SettingsView({ store }: { store: StoreApi }) {
  const [backend, setBackendState] = useState(getBackend());
  const [clientId, setCid] = useState(localStorage.getItem("goals101_ya_clientId") ?? "");
  const [repo, setRepo] = useState(ghRepo());
  const [pat, setPat] = useState(getGhToken() ?? "");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<DiagStep[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <h1>Синхронизация и данные</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Хранилище данных</h2>
        <label>Где хранить data.json</label>
        <select
          value={backend}
          onChange={(e) => {
            const b = e.target.value as "yandex" | "github";
            setBackend(b);
            setBackendState(b);
            setMsg(b === "github" ? "Выбран GitHub" : "Выбран Яндекс.Диск");
          }}
        >
          <option value="github">GitHub — приватный репозиторий (рекомендуется, работает везде)</option>
          <option value="yandex">Яндекс.Диск (на телефонах чтение может не работать)</option>
        </select>

        {backend === "github" ? (
          <div className="form" style={{ marginTop: 12 }}>
            <label>Репозиторий (owner/name)</label>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="DZharenko/goals-data" />
            <label>Personal access token (fine-grained, Contents: read/write)</label>
            <input value={pat} onChange={(e) => setPat(e.target.value)} placeholder="github_pat_..." />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn secondary" onClick={() => {
                setGhRepo(repo); setGhToken(pat); setMsg("Сохранено");
              }}>Сохранить</button>
              {getGhToken() ? (
                <>
                  <span className="badge done">токен задан{getGhLogin() ? ` (${getGhLogin()})` : ""}</span>
                  <button className="btn" onClick={() => store.doSync()}>Синхронизировать сейчас</button>
                  <button className="btn danger" onClick={() => { ghLogout(); setPat(""); setMsg("Токен удалён"); }}>Удалить токен</button>
                </>
              ) : (
                <span className="badge">нет токена</span>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              1) Создайте приватный репозиторий: github.com/new → имя goals-data → Private → Create (без README).<br />
              2) Создайте токен: github.com/settings/personal-access-tokens/new → Repository access: Only select repositories → goals-data → Permissions: Contents → Read and write → Generate.<br />
              3) Вставьте токен выше. Он хранится только в вашем браузере.
            </p>
          </div>
        ) : (
          <div className="form" style={{ marginTop: 12 }}>
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
          </div>
        )}

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
              <div className="day-plan-item" key={s.name} style={{ flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: "50%" }}>{s.name}</span>
                <span className={`badge ${s.ok ? "done" : "failed"}`}>{s.ok ? "OK" : "ПРОБЛЕМА"}</span>
                <span className="muted" style={{ fontSize: 12, wordBreak: "break-all", flexBasis: "100%" }}>
                  {renderDetail(s.detail)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Резервные копии</h2>
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
