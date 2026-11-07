// Testversjon av datalaget: alt i minnet, ingen innlogging, falsk bildesjekk.
// Brukes bare med `npm run dev:mock` og kommer ikke med i den publiserte appen.
import { createStore } from "./common.js";

export const configured = true;
const USER = { id: "mock-user", email: "test@eksempel.no" };
let user = USER;
const authCbs = [];

export async function getUser() { return user; }
export function onAuth(cb) { authCbs.push(cb); }
export async function sendCode() {}
export async function verifyCode() { user = USER; authCbs.forEach(cb => cb(user)); }
export async function signOut() { user = null; authCbs.forEach(cb => cb(null)); }
export async function isMember() { return true; }

const store = createStore();
export const subscribeData = store.subscribe;
export async function start() {
  store.replace("stores", [{ id: "krs", name: "Kristiansand", sort: 0 }, { id: "bortelid", name: "Bortelid", sort: 1 }]);
  store.replace("trip_state", [{ id: "main", mode: "hytta", changedAt: Date.now() - 2 * 864e5, nextTrip: null }]);
  store.status("ok");
}
export async function setTrip(patch) { store.upsertLocal("trip_state", { id: "main", ...patch, changedAt: Date.now(), changedBy: user?.id }); }
function crud(table) {
  return {
    async add(data) { const row = { id: crypto.randomUUID(), updatedBy: user?.id, createdAt: Date.now(), ...data }; store.upsertLocal(table, row); return row.id; },
    async update(id, patch) { store.patchLocal(table, id, { ...patch, updatedBy: user?.id }); },
    async remove(id) { store.removeLocal(table, id); },
  };
}
export const items = crud("items");
export const extras = crud("extras");
export const stores = crud("stores");
export async function markChecked(place, userId) { store.upsertLocal("place_checks", { place, at: Date.now(), by: userId }); }
export async function setName(userId, name) { store.upsertLocal("profiles", { id: userId, name }); }

export async function analyze(place, known) {
  await new Promise(r => setTimeout(r, 600));
  return {
    items: known.map((k, i) => ({ id: k.id, seen: ["ja", "nei", "usikker"][i % 3], level: i % 3 === 0 ? (i % 2 ? "lite" : "ok") : null })),
    new: [{ name: "Leverpostei", category: "palegg", staple: false, level: "ok", count: 1, shelf_days: 10 }],
  };
}
