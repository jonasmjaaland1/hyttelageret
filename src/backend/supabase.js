// Datalaget mot Supabase. Appen ser bare funksjonene som eksporteres her.
import { createClient } from "@supabase/supabase-js";
import { createStore, toBase64 } from "./common.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
const sb = configured ? createClient(url, key) : null;

const ms = v => (v ? Date.parse(v) : null);
const iso = v => (v == null ? null : new Date(v).toISOString());

const MAPS = {
  items: {
    from: r => ({
      id: r.id, name: r.name, place: r.place, category: r.category, store: r.store, always: r.always,
      status: r.status, qty: r.qty, frozen: r.frozen, prevStatus: r.prev_status, prevQty: r.prev_qty,
      boughtAt: ms(r.bought_at), updatedBy: r.updated_by, updatedAt: ms(r.updated_at),
      shelfDays: r.shelf_days ?? null, expiresOn: r.expires_on ?? null,
      stockedAt: ms(r.stocked_at), createdAt: ms(r.created_at),
    }),
    cols: {
      id: "id", name: "name", place: "place", category: "category", store: "store", always: "always", status: "status",
      qty: "qty", frozen: "frozen", prevStatus: "prev_status", prevQty: "prev_qty", boughtAt: ["bought_at", iso],
      shelfDays: "shelf_days", expiresOn: "expires_on", stockedAt: ["stocked_at", iso],
    },
  },
  trip_state: {
    from: r => ({
      id: r.id, mode: r.mode, changedAt: ms(r.changed_at), changedBy: r.changed_by, nextTrip: r.next_trip,
      cabinLat: r.cabin_lat ?? null, cabinLng: r.cabin_lng ?? null,
    }),
    cols: { mode: "mode", nextTrip: "next_trip", cabinLat: "cabin_lat", cabinLng: "cabin_lng" },
  },
  extras: {
    from: r => ({
      id: r.id, name: r.name, store: r.store, done: r.done, doneAt: ms(r.done_at),
      updatedBy: r.updated_by, updatedAt: ms(r.updated_at),
    }),
    cols: { id: "id", name: "name", store: "store", done: "done", doneAt: ["done_at", iso] },
  },
  stores: { from: r => ({ id: r.id, name: r.name, sort: r.sort }), cols: { id: "id", name: "name", sort: "sort" } },
  place_checks: { from: r => ({ place: r.place, at: ms(r.checked_at), by: r.checked_by }), cols: {} },
  profiles: { from: r => ({ id: r.id, name: r.name }), cols: {} },
};
const TABLES = Object.keys(MAPS);

function toRow(table, patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    const c = MAPS[table].cols[k];
    if (!c) continue;
    if (Array.isArray(c)) row[c[0]] = c[1](v); else row[c] = v;
  }
  return row;
}

// ---------- Innlogging ----------
export async function getUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}
export function onAuth(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
}
export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  if (error) throw error;
}
export async function verifyCode(email, token) {
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}
export async function signInWithPassword(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function setPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}
export async function signOut() { await sb.auth.signOut(); }
export async function isMember() {
  const { data, error } = await sb.rpc("is_member");
  return !error && data === true;
}

// ---------- Data ----------
const store = createStore();
export const subscribeData = store.subscribe;

async function load(table) {
  const { data, error } = await sb.from(table).select("*");
  if (error) { store.status("error"); return; }
  store.replace(table, data.map(MAPS[table].from));
  store.status("ok");
}
let channel = null;
let timers = {};
export async function start() {
  await Promise.all(TABLES.map(load));
  if (channel) return;
  channel = sb.channel("hytta");
  for (const t of TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
      clearTimeout(timers[t]);
      timers[t] = setTimeout(() => load(t), 120);
    });
  }
  channel.subscribe();
  // Mobilen kan ha sovet og gått glipp av endringer: hent alt på nytt når appen vises igjen.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") TABLES.forEach(load);
  });
  window.addEventListener("online", () => TABLES.forEach(load));
}

async function run(table, op) {
  const { error } = await op;
  if (error) { await load(table); throw error; }
}
function crud(table) {
  return {
    async add(data) {
      const row = { id: crypto.randomUUID(), ...data };
      store.upsertLocal(table, row);
      await run(table, sb.from(table).insert(toRow(table, row)));
      return row.id;
    },
    async update(id, patch) {
      store.patchLocal(table, id, patch);
      await run(table, sb.from(table).update(toRow(table, patch)).eq("id", id));
    },
    async remove(id) {
      store.removeLocal(table, id);
      await run(table, sb.from(table).delete().eq("id", id));
    },
  };
}
export const items = crud("items");
export const extras = crud("extras");
export const stores = crud("stores");

// Turstatus: én rad med id 'main'.
export async function setTrip(patch) {
  store.upsertLocal("trip_state", { id: "main", ...patch, changedAt: Date.now() });
  await run("trip_state", sb.from("trip_state").update(toRow("trip_state", patch)).eq("id", "main"));
}

export async function markChecked(place, userId) {
  store.upsertLocal("place_checks", { id: place, place, at: Date.now(), by: userId });
  await run("place_checks", sb.from("place_checks").upsert({ place, checked_at: new Date().toISOString() }));
}
export async function setName(userId, name) {
  store.upsertLocal("profiles", { id: userId, name });
  await run("profiles", sb.from("profiles").upsert({ id: userId, name }));
}

// ---------- Bildesjekk ----------
export async function analyze(place, known, blobs, signal) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw { code: "not_signed_in" };
  const images = await Promise.all(blobs.map(toBase64));
  let res;
  try {
    res = await fetch("/api/analyze", {
      method: "POST", signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ place, known, images }),
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled" };
    throw { code: "offline" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: body.error || "upstream" };
  return body;
}
