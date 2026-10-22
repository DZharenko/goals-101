import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Диагностика запуска: если приложение не поднялось за 20 с или упало —
// показываем причину прямо на странице (важно для телефона).

declare global {
  interface Window {
    __APP_BOOTED__?: boolean;
    __BOOT_ERROR__?: string;
  }
}

const BOOT_DEADLINE_MS = 20000;
const t0 = Date.now();

function showFatal(msg: string) {
  if (document.getElementById("boot-fatal")) return;
  const el = document.createElement("pre");
  el.id = "boot-fatal";
  el.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;overflow:auto;z-index:99999;" +
    "background:#1a1e26;color:#ef6b73;font:13px/1.5 monospace;white-space:pre-wrap";
  el.textContent =
    "Приложение не загрузилось.\n\n" +
    msg +
    "\n\nБраузер: " + navigator.userAgent +
    "\nIndexedDB: " + ("indexedDB" in window ? "есть" : "НЕТ") +
    "\n\nСделайте скриншот и отправьте разработчику.";
  document.body.appendChild(el);
}

window.addEventListener("error", (e) => {
  if (!window.__APP_BOOTED__) showFatal(String(e.error ?? e.message));
});
window.addEventListener("unhandledrejection", (e) => {
  if (!window.__APP_BOOTED__) showFatal(String(e.reason));
});

// Тайм-аут: контент приложения не появился — диагноз
setTimeout(() => {
  if (window.__APP_BOOTED__) return;
  if (document.querySelector(".tabs")) {
    window.__APP_BOOTED__ = true; // на самом деле поднялось — вероятно, флаг не успел
    return;
  }
  if (window.__BOOT_ERROR__) {
    showFatal("Ошибка при загрузке локальной базы:\n" + window.__BOOT_ERROR__);
  } else {
    showFatal(
      "Загрузка зависла (нет ответа за 20 с).\n" +
      "Вероятная причина: браузер телефона не поддерживает IndexedDB/сервис-воркер."
    );
  }
}, BOOT_DEADLINE_MS);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
