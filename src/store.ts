import { useCallback, useEffect, useRef, useState } from "react";
import { emptyDataDoc, type DataDoc, type Base } from "./schema";
import { getDeviceId, loadLocal, saveLocal } from "./db";
import { sync as runSync, captureTokenFromHash, type SyncResult } from "./sync";

// Глобальный стор: DataDoc в React-состоянии + автосохранение + синк с debounce.

let docRef: DataDoc = emptyDataDoc(getDeviceId());

export function useStore() {
  const [doc, setDoc] = useState<DataDoc>(docRef);
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState<SyncResult | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const rerunRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    captureTokenFromHash();
    loadLocal()
      .then((d) => {
        docRef = d;
        setDoc(d);
        setLoaded(true);
      })
      .catch((e) => {
        window.__BOOT_ERROR__ = e instanceof Error ? e.message : String(e);
        // всё равно даём интерфейсу подняться с пустым документом
        docRef = emptyDataDoc(getDeviceId());
        setDoc(docRef);
        setLoaded(true);
      });
  }, []);

  const mutate = useCallback((fn: (draft: DataDoc) => void) => {
    const next: DataDoc = JSON.parse(JSON.stringify(docRef));
    fn(next);
    docRef = next;
    setDoc(next);
    saveLocal(next).catch(console.error);
    // debounce синк 5с после мутаций
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => doSync(), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSync = useCallback(async () => {
    if (syncingRef.current) {
      // уже идёт — перепланируем один повтор, чтобы не потерять свежие правки
      if (rerunRef.current) clearTimeout(rerunRef.current);
      rerunRef.current = setTimeout(() => { void doSync(); }, 3000);
      return { status: "ok", message: "Синк уже идёт" } as SyncResult;
    }
    syncingRef.current = true;
    try {
      const r = await runSync(() => Promise.resolve(docRef), async (d) => {
        docRef = d;
        await saveLocal(d);
      });
      setSyncState(r);
      if (r.status === "ok") setDoc({ ...docRef });
      return r;
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // pull при открытии
  useEffect(() => {
    if (loaded) doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return { doc, mutate, loaded, syncState, doSync, setDocDirect: (d: DataDoc) => { docRef = d; setDoc(d); saveLocal(d).catch(console.error); } };
}

// Хелперы мутаций
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

export function base(): Base {
  const now = new Date().toISOString();
  return { id: newId(), createdAt: now, updatedAt: now, deviceId: getDeviceId() };
}

export function touch<T extends Base>(item: T): T {
  return { ...item, updatedAt: new Date().toISOString(), deviceId: getDeviceId() };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
