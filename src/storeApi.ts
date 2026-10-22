import { useStore } from "./store";

export type StoreApi = ReturnType<typeof useStore>;
export { useStore, newId, base, touch, today } from "./store";
