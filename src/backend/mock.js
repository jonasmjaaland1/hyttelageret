// Testversjon av datalaget: alt i minnet, ingen innlogging, falsk bildesjekk.
// Brukes bare med `npm run dev:mock` og kommer ikke med i den publiserte appen.
import { createStore } from "./common.js";

export const configured = true;
const USER = { id: "mock-user", email: "test@eksempel.no" };
const loggedOut = () => { try { return localStorage.getItem("mock-logged-out") === "1"; } catch (e) { return false; } };
const setLoggedOut = v => { try { localStorage.setItem("mock-logged-out", v ? "1" : "0"); } catch (e) {} };
let user = loggedOut() ? null : USER;
const authCbs = [];

export async function getUser() { return user; }
export function onAuth(cb) { authCbs.push(cb); }
export async function sendCode() {}
export async function verifyCode() { setLoggedOut(false); user = USER; authCbs.forEach(cb => cb(user)); }
export async function signInWithPassword(email, password) {
  if (password !== "hytta123") throw { message: "Invalid login credentials" };
  setLoggedOut(false); user = USER; authCbs.forEach(cb => cb(user));
}
export async function setPassword() {}
export async function signOut() { setLoggedOut(true); user = null; authCbs.forEach(cb => cb(null)); }
export async function isMember() { return true; }

const store = createStore();
export const subscribeData = store.subscribe;
export async function start() {
  store.replace("stores", [{ id: "krs", name: "Kristiansand", sort: 0 }, { id: "bortelid", name: "Bortelid", sort: 1 }]);
  store.replace("trip_state", [{ id: "main", mode: "hytta", changedAt: Date.now() - 2 * 864e5, nextTrip: null, cabinLat: 58.83, cabinLng: 7.33 }]);
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

export async function savePlan(data) { store.upsertLocal("plans", { id: "current", data, updatedBy: user?.id }); }
export async function clearPlan() { store.removeLocal("plans", "current"); }
export async function planMenu(p) {
  await new Promise(r => setTimeout(r, 500));
  const ing = (name, amount, category, have = false) => ({ name, amount, category, have });
  const dinners = [
    { title: "Pølser i lompe", description: "Enkel første kveld.", ingredients: [ing("Pølser", "2 pk", "kjott", true), ing("Lomper", "1 pk", "brod"), ing("Ketchup", "1 fl", "krydder", true)] },
    { title: "Taco", description: "Fredagstaco med alt tilbehør.", ingredients: [ing("Kjøttdeig", "400 g", "kjott"), ing("Tacoskjell", "1 pk", "torr"), ing("Rømme", "1 beger", "meieri"), ing("Salat", "1 stk", "frukt")] },
    { title: "Laks i ovn", description: "Laks med poteter og brokkoli.", ingredients: [ing("Laks", "400 g", "kjott"), ing("Poteter", "1 kg", "frukt"), ing("Brokkoli", "1 stk", "frukt"), ing("Smør", "50 g", "meieri", true)] },
  ];
  if (p.replace) {
    return { meal: { day: p.replace.day, type: p.replace.type, title: "Kyllinggryte", description: "Kremet gryte med ris.", ingredients: [ing("Kyllingfilet", "400 g", "kjott"), ing("Ris", "2 dl", "torr", true), ing("Matfløte", "3 dl", "meieri"), ing("Rømme", "1 beger", "meieri")] } };
  }
  const meals = [];
  for (let d = 1; d <= p.days; d++) for (const t of p.mealTypes) {
    if (t === "middag") meals.push({ day: d, type: t, ...dinners[(d - 1) % dinners.length] });
    else meals.push({ day: d, type: t, title: t === "frokost" ? "Egg og bacon" : "Brødskiver", description: "Enkelt.", ingredients: [ing(t === "frokost" ? "Bacon" : "Brød", "1 pk", t === "frokost" ? "kjott" : "brod")] });
  }
  return { meals };
}
