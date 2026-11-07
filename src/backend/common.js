// Felles hjelpere for datalagene: en liten tilstandsbeholder med lokale (optimistiske) endringer.
export function createStore() {
  const data = { items: [], extras: [], stores: [], place_checks: [], profiles: [], trip_state: [], plans: [] };
  const listeners = new Set();
  let status = "loading";
  const key = (table, row) => (table === "place_checks" ? row.place : row.id);
  const emit = () => listeners.forEach(fn => fn(data, status));
  return {
    subscribe(fn) { listeners.add(fn); fn(data, status); return () => listeners.delete(fn); },
    status(s) { if (s !== status) { status = s; emit(); } },
    replace(table, rows) { data[table] = rows; emit(); },
    upsertLocal(table, row) {
      const k = key(table, row);
      const i = data[table].findIndex(r => key(table, r) === k);
      const next = { updatedAt: Date.now(), ...row };
      data[table] = i < 0 ? [...data[table], next] : data[table].map((r, j) => (j === i ? { ...r, ...next } : r));
      emit();
    },
    patchLocal(table, id, patch) {
      data[table] = data[table].map(r => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r));
      emit();
    },
    removeLocal(table, id) { data[table] = data[table].filter(r => r.id !== id); emit(); },
  };
}

export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
