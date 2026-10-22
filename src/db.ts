import Dexie, { type Table } from "dexie";
import {
  emptyDataDoc,
  type DataDoc,
  type Goal,
  type Subgoal,
  type LogEntry,
  type Workout,
  type SideTask,
  type Challenge,
  type ScheduleSlot,
  type EventRecord,
} from "./schema";

const DB_NAME = "goals101";
const DOC_KEY = "main";

interface StoredDoc {
  key: string;
  doc: DataDoc;
}

class GoalsDB extends Dexie {
  docs!: Table<StoredDoc, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ docs: "key" });
  }
}

export const db = new GoalsDB();

export function getDeviceId(): string {
  const KEY = "goals101_deviceId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function loadLocal(): Promise<DataDoc> {
  const rec = await db.docs.get(DOC_KEY);
  if (rec) return rec.doc;
  return emptyDataDoc(getDeviceId());
}

export async function saveLocal(doc: DataDoc): Promise<void> {
  doc.savedAt = new Date().toISOString();
  doc.deviceId = getDeviceId();
  await db.docs.put({ key: DOC_KEY, doc });
}

// Экспорт/импорт как страховка
export function exportDoc(doc: DataDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goals101-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImported(text: string): DataDoc {
  const doc = JSON.parse(text) as DataDoc;
  if (doc.schemaVersion !== 1) throw new Error(`Неизвестная версия схемы: ${doc.schemaVersion}`);
  return doc;
}

export type { DataDoc, Goal, Subgoal, LogEntry, Workout, SideTask, Challenge, ScheduleSlot, EventRecord };
