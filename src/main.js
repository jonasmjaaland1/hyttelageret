import "./style.css";
import backend from "./backend/index.js";

// ---------- Faste data ----------
const PLACES = [
  { id: "kjol", name: "Kjøleskap", short: "Kjøl", cat: "meieri" },
  { id: "frys", name: "Fryser", short: "Frys", cat: "frys" },
  { id: "torr", name: "Tørrskap", short: "Tørr", cat: "torr" },
  { id: "hus", name: "Husholdning", short: "Hus", cat: "hus" },
];
const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p]));
const STATUS = { ok: "Nok", lite: "Lite", tomt: "Tomt" };
const NEXT = { ok: "lite", lite: "tomt", tomt: "ok" };
const CATS = [
  ["frukt", "Frukt og grønt"], ["brod", "Brød og bakevarer"], ["meieri", "Meieri og egg"], ["palegg", "Pålegg"],
  ["kjott", "Kjøtt og fisk"], ["frys", "Frysevarer"], ["torr", "Tørrvarer"], ["hermetikk", "Hermetikk"],
  ["krydder", "Krydder og saus"], ["snacks", "Snacks og godteri"], ["drikke", "Drikke"], ["hus", "Husholdning"], ["annet", "Annet"],
];
const CAT = Object.fromEntries(CATS);
const CAT_ORDER = Object.fromEntries(CATS.map((c, i) => [c[0], i]));
const DEFAULT_STORES = [{ id: "krs", name: "Kristiansand", sort: 0 }, { id: "bortelid", name: "Bortelid", sort: 1 }];
const BOUGHT_WINDOW = 12 * 3600e3;
const MAX_IMAGES = 5;
const STARTER = {
  kjol: [["Smør", "meieri"], ["Egg", "meieri"], ["Brunost", "palegg"], ["Syltetøy", "palegg"], ["Majones", "krydder"], ["Ketchup", "krydder"], ["Sennep", "krydder"]],
  frys: [["Brød", "brod"], ["Kjøttdeig", "kjott"], ["Pølser", "kjott"], ["Pizza", "frys"]],
  torr: [["Kaffe", "drikke"], ["Te", "drikke"], ["Kakao", "drikke"], ["Sukker", "torr"], ["Hvetemel", "torr"], ["Pasta", "torr"], ["Ris", "torr"], ["Havregryn", "torr"], ["Knekkebrød", "brod"], ["Salt", "krydder"], ["Pepper", "krydder"], ["Olivenolje", "krydder"], ["Buljong", "krydder"], ["Tacokrydder", "krydder"], ["Hermetiske tomater", "hermetikk"]],
  hus: [["Dopapir", "hus"], ["Tørkerull", "hus"], ["Oppvaskmiddel", "hus"], ["Søppelposer", "hus"], ["Matpapir", "hus"], ["Aluminiumsfolie", "hus"], ["Fyrstikker", "hus"], ["Tennbriketter", "hus"], ["Stearinlys", "hus"], ["Batterier", "hus"]],
};

// Holdbarhet i dager etter kjøp/åpning, når ingenting annet er satt. null = holder seg lenge.
const SHELF_DEFAULT = { frukt: 7, brod: 4, meieri: 10, palegg: 21, kjott: 3, krydder: 90, drikke: 30, snacks: 60, annet: 14 };
const STARTER_SHELF = { "Smør": 60, "Egg": 28, "Brunost": 60, "Syltetøy": 90, "Majones": 60, "Ketchup": 180, "Sennep": 180 };
const SHELF_OPTIONS = [["", "Automatisk"], ["3", "3 dager"], ["7", "1 uke"], ["14", "2 uker"], ["30", "1 måned"], ["90", "3 måneder"], ["365", "Holder lenge"]];
const UNKNOWN_RETURN_DAYS = 14;
const TABS = ["liste", "lager", "plan", "sjekk"];
const MEAL_LABEL = { frokost: "Frokost", lunsj: "Lunsj", middag: "Middag" };
// Ukens kundeaviser hos Mattilbud. Rekkefølge: lavpris først.
const FLYERS = [
  ["REMA 1000", "rema-1000-no"], ["KIWI", "kiwi-no"], ["Extra", "extra-no"], ["Obs", "obs-no"],
  ["Bunnpris", "bunnpris-no"], ["Coop Mega", "coop-mega-no"], ["Spar", "spar-no"], ["Meny", "meny-no"], ["Joker", "joker-no"],
];
const DAY = 864e5;

// ---------- Tilstand ----------
const S = {
  user: null, uid: null,
  items: new Map(), extras: new Map(), people: {}, stores: DEFAULT_STORES, checks: {},
  trip: { mode: "hjemme", nextTrip: null, changedAt: null }, justDeparted: false, where: null, offerPassword: false, plan: null, planBusy: null,
  status: "loading", slow: false, started: false, askedName: false,
  tab: "liste", place: "torr", addStore: "krs",
};
try { const p = localStorage.getItem("hytte-place"); if (PLACE[p]) S.place = p; } catch (e) {}

// ---------- Hjelpere ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").trim().toLowerCase();
const stores = () => (S.stores.length ? S.stores : DEFAULT_STORES);
const storeName = id => (stores().find(s => s.id === id) || stores()[0]).name;
const validStore = id => (stores().some(s => s.id === id) ? id : stores()[0].id);
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const myName = () => (S.uid && S.people[S.uid]) || "";
const personName = uid => (uid && S.people[uid]) || "";

function when(ts) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 60e3) return "nå nettopp";
  if (diff < 3600e3) return `for ${Math.round(diff / 60e3)} min siden`;
  const hm = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= day) return `i dag ${hm}`;
  if (d >= new Date(day - 864e5)) return `i går ${hm}`;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}
function monthLabel(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || "")) return "";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("nb-NO", { month: "short", year: "numeric" });
}
function monthsOld(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || "")) return 0;
  const [y, m] = ym.split("-").map(Number), n = new Date();
  return (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m);
}
function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function isoDay(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const endOfDay = day => Date.parse(day + "T23:59:59");
const fmtDay = ts => new Date(ts).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" }).replace(/\.$/, "");

// Holdbarhet
function shelfDays(i) {
  if (i.place === "frys" || i.place === "hus") return null;
  if (i.shelfDays) return i.shelfDays;
  // Uten eget anslag regnes bare kjøleskapet og frukt som ferskvarer (knekkebrød i tørrskapet holder seg).
  if (i.place === "kjol" || i.category === "frukt") return SHELF_DEFAULT[i.category] ?? 14;
  return null;
}
function expiresAt(i) {
  if (i.expiresOn) return endOfDay(i.expiresOn);
  const d = shelfDays(i);
  if (!d || d >= 365) return null;
  const base = i.stockedAt || i.boughtAt || i.createdAt;
  return base ? base + d * DAY : null;
}
// Varer som ikke er tomme og går ut før et gitt tidspunkt
const riskList = until => [...S.items.values()]
  .filter(i => i.status !== "tomt" && (expiresAt(i) ?? Infinity) < until)
  .sort((a, b) => expiresAt(a) - expiresAt(b));
function expiryText(i) {
  const e = expiresAt(i); if (!e) return "";
  const days = Math.floor((e - Date.now()) / DAY);
  if (days < 0) return `<span class="exp-gone">Trolig gått ut</span>`;
  if (days === 0) return `<span class="exp-soon">Går ut i dag</span>`;
  if (days === 1) return `<span class="exp-soon">Går ut i morgen</span>`;
  if (days <= 3) return `<span class="exp-soon">Går ut om ${days} dager</span>`;
  return "";
}

let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- Skriving ----------
async function save(fn) {
  try { await fn(); return true; }
  catch (e) {
    console.error(e);
    toast(navigator.onLine ? "Kunne ikke lagre. Prøv igjen." : "Ingen nettforbindelse. Endringen ble ikke lagret.");
    return false;
  }
}
const by = () => ({ updatedBy: S.uid });
const itemUpdate = (id, patch) => save(() => backend.items.update(id, { ...patch, ...by() }));
const itemDelete = id => save(() => backend.items.remove(id));
function itemAdd(data) {
  const body = {
    name: data.name, place: data.place, category: data.category || PLACE[data.place].cat,
    store: validStore(data.store), always: !!data.always, status: data.status || "ok", ...by(),
    shelfDays: data.shelfDays || null, expiresOn: data.expiresOn || null, stockedAt: Date.now(),
  };
  if (data.place === "frys") { body.qty = Number.isFinite(data.qty) ? data.qty : 1; body.frozen = data.frozen || thisMonth(); }
  return save(() => backend.items.add(body));
}
const extraUpdate = (id, patch) => save(() => backend.extras.update(id, { ...patch, ...by() }));
const extraDelete = id => save(() => backend.extras.remove(id));

// ---------- Avledede lister ----------
const itemsIn = place => [...S.items.values()].filter(i => i.place === place)
  .sort((a, b) => (CAT_ORDER[a.category] ?? 99) - (CAT_ORDER[b.category] ?? 99) || a.name.localeCompare(b.name, "nb"));
const needs = i => i.status === "lite" || i.status === "tomt";
const boughtRecently = i => i.status === "ok" && i.boughtAt && Date.now() - i.boughtAt < BOUGHT_WINDOW;

function shopping() {
  const rows = [];
  for (const i of S.items.values()) {
    if (needs(i) || boughtRecently(i)) rows.push({
      kind: "item", id: i.id, name: i.name, store: validStore(i.store), cat: i.category || "annet",
      done: !needs(i), status: i.status, place: i.place, always: !!i.always,
    });
  }
  for (const x of S.extras.values()) {
    if (!x.done || (x.doneAt && Date.now() - x.doneAt < BOUGHT_WINDOW)) rows.push({
      kind: "extra", id: x.id, name: x.name, store: validStore(x.store), cat: CAT[x.category] ? x.category : "annet", done: !!x.done, note: x.note,
    });
  }
  return rows;
}

// ---------- Visninger ----------
function render() {
  renderActivity(); renderBanner(); renderTabs();
  if (S.tab === "liste") renderListe();
  if (S.tab === "lager") renderLager();
  if (S.tab === "sjekk") renderSjekk();
  if (S.tab === "plan") renderPlan();
}

function renderActivity() {
  const el = $("#activity");
  $("#meBtn").textContent = myName() || "Meg";
  if (S.status === "loading") { el.textContent = S.slow ? "Får ikke kontakt med lageret ennå" : "Henter lageret …"; return; }
  let last = null;
  for (const d of [...S.items.values(), ...S.extras.values()]) if (d.updatedAt && (!last || d.updatedAt > last.updatedAt)) last = d;
  const mode = S.trip.mode === "hytta" ? "På hytta" : "Hjemme";
  if (!last) { el.textContent = `${mode} · ingen endringer ennå`; return; }
  const who = personName(last.updatedBy);
  el.textContent = `${mode} · sist endret ${when(last.updatedAt)}${who ? " av " + who : ""}`;
}

function renderTrip() {
  const out = $("#tripOut");
  if (S.status === "loading") { out.innerHTML = ""; return; }
  const t = S.trip, since = t.changedAt ? fmtDay(t.changedAt) : "";
  if (t.mode === "hytta") {
    const soon = riskList(Date.now() + 2 * DAY);
    const left = S.where === "far";
    out.innerHTML = `<div class="trip ${left ? "" : "hytta"}">
      <div class="trip-head"><span class="mode-dot"></span><div><b>${left ? "Har dere dratt?" : "På hytta"}</b><small>${esc(left ? "Du er et stykke unna hytta" : since ? "Kom fram " + since : "")}</small></div></div>
      ${!left && soon.length ? `<p class="soon">Bruk snart: ${soon.slice(0, 5).map(i => `<b>${esc(i.name)}</b>`).join(", ")}${soon.length > 5 ? ` og ${soon.length - 5} til` : ""}</p>` : ""}
      <button class="btn primary block" type="button" data-act="depart">Vi drar</button>
    </div>`;
    return;
  }
  const near = S.where === "near";
  const risk = riskList(Date.now());
  out.innerHTML = `<div class="trip ${near ? "hytta" : ""}">
    <div class="trip-head"><span class="mode-dot"></span><div><b>${near ? "Du er ved hytta" : "Hjemme"}</b><small>${esc(near ? "Trykk når dere er fremme" : since ? "Dro fra hytta " + since : "")}</small></div></div>
    ${!near && risk.length ? `<div class="risk-title">Har trolig gått ut på hytta</div>
      <ul class="rows">${risk.map(i => `<li>
        <div class="rname"><span>${esc(i.name)}</span><small>${esc(PLACE[i.place]?.name || "")} · holdt til ca. ${esc(fmtDay(expiresAt(i)))}</small></div>
        <button class="chipbtn" type="button" data-act="renew" data-id="${esc(i.id)}">Kjøp nytt</button>
      </li>`).join("")}</ul>` : ""}
    <button class="btn ${near ? "primary" : ""} block" type="button" data-act="arrive">Vi er på hytta</button>
  </div>`;
}

// ---------- Posisjon ----------
// Hyttas posisjon lagres i databasen. Telefonens posisjon brukes bare her, og sendes ingen steder.
const NEAR_KM = 2, FAR_KM = 20;
const hasCabin = () => Number.isFinite(S.trip.cabinLat) && Number.isFinite(S.trip.cabinLng);
function distKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function getPosition(fresh) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => { try { localStorage.setItem("hytte-gps", "1"); } catch (e) {} resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: fresh ? 0 : 10 * 60e3 },
    );
  });
}
// Sjekker posisjonen stille når appen åpnes. Spør aldri om tillatelse av seg selv;
// det skjer først når noen trykker «Vi er på hytta» eller lagrer hyttas posisjon.
async function checkLocation() {
  if (!hasCabin()) return;
  let state = "unknown";
  try { if (navigator.permissions) state = (await navigator.permissions.query({ name: "geolocation" })).state; } catch (e) {}
  let optedIn = false;
  try { optedIn = localStorage.getItem("hytte-gps") === "1"; } catch (e) {}
  if (state === "denied" || (state !== "granted" && !optedIn)) return;
  const pos = await getPosition(false);
  if (!pos) return;
  const d = distKm(pos.lat, pos.lng, S.trip.cabinLat, S.trip.cabinLng);
  const where = d <= NEAR_KM ? "near" : d >= FAR_KM ? "far" : null;
  if (where !== S.where) { S.where = where; render(); }
}

function renderBanner() {
  const b = $("#banner");
  let html = "";
  if (!navigator.onLine) html = '<div class="banner warn">Ingen nettforbindelse. Du ser det som sist ble hentet, og endringer lagres ikke før nettet er tilbake.</div>';
  else if (S.status === "error") html = '<div class="banner warn">Klarte ikke å hente lageret. Sjekk nettet. Appen prøver igjen når du åpner den på nytt.</div>';
  else if (S.slow && S.status === "loading") html = '<div class="banner">Får ikke kontakt med lageret ennå. Sjekk mobildekningen.</div>';
  b.innerHTML = html; b.hidden = !html;
}

function renderTabs() {
  for (const t of document.querySelectorAll(".tab")) t.setAttribute("aria-current", t.dataset.tab === S.tab ? "page" : "false");
  for (const v of TABS) $("#view-" + v).hidden = v !== S.tab;
  const n = shopping().filter(r => !r.done).length;
  const c = $("#listCount"); c.hidden = !n; c.textContent = n;
  S.addStore = validStore(S.addStore);
  $("#addStore").textContent = storeName(S.addStore);
}

function rowName(r) {
  const sub = r.kind === "item" ? `${r.done ? "Handlet" : STATUS[r.status]} · ${PLACE[r.place]?.name || ""}` : (r.note || "Lagt til");
  return `<div class="rname"><span>${esc(r.name)}</span><small>${esc(sub)}</small></div>`;
}
function shopRow(r) {
  const other = stores().length === 2 ? stores().find(s => s.id !== r.store) : null;
  const moveLabel = other ? "→ " + other.name : "Flytt";
  const canDrop = !r.done && (r.kind === "extra" || !r.always);
  return `<li class="${r.done ? "done" : ""}">
    <button class="check" type="button" data-act="buy" data-kind="${r.kind}" data-id="${esc(r.id)}" aria-pressed="${r.done}" aria-label="${r.done ? "Angre handlet" : "Merk som handlet"}: ${esc(r.name)}">${ICON.check}</button>
    ${rowName(r)}
    ${r.done ? "" : `<button class="chipbtn" type="button" data-act="move" data-kind="${r.kind}" data-id="${esc(r.id)}">${esc(moveLabel)}</button>`}
    ${canDrop ? `<button class="iconbtn" type="button" data-act="drop" data-kind="${r.kind}" data-id="${esc(r.id)}" aria-label="Ikke kjøp ${esc(r.name)}">${ICON.x}</button>` : ""}
  </li>`;
}

function renderListe() {
  renderTrip();
  const out = $("#listOut");
  if (S.status === "loading") { out.innerHTML = ""; return; }
  const rows = shopping();
  if (!S.items.size && !rows.length) {
    out.innerHTML = `<div class="empty"><h2>Lageret er tomt</h2><p>Registrer det som står på hytta først. Da lager handlelisten seg selv.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="starter">Velg vanlige hyttevarer</button>
      <button class="btn" type="button" data-act="goto" data-tab="sjekk">Fotografer skapene</button></div></div>`;
    return;
  }
  const active = rows.filter(r => !r.done);
  let html = active.length ? `<div class="flyers"><div class="cat" style="margin:0 0 6px">Ukens kundeaviser</div><div class="flyer-row">${FLYERS.map(([n, slug]) =>
    `<a class="chipbtn" href="https://mattilbud.no/kundeaviser/${slug}" target="_blank" rel="noopener">${n}</a>`).join("")}</div></div>` : "";
  if (!active.length) html += `<div class="empty"><h2>Alt er på plass</h2><p>Ingenting å kjøpe nå. Kjør avreisesjekken når du drar fra hytta.</p></div>`;
  for (const st of stores()) {
    const mine = rows.filter(r => r.store === st.id);
    if (!mine.length) continue;
    const act = mine.filter(r => !r.done), done = mine.filter(r => r.done);
    html += `<section class="store"><h2>${esc(st.name)} <span class="n">${act.length ? act.length + " igjen" : "ferdig"}</span></h2>`;
    const byCat = {};
    for (const r of act) (byCat[r.cat] = byCat[r.cat] || []).push(r);
    for (const c of Object.keys(byCat).sort((a, b) => (CAT_ORDER[a] ?? 99) - (CAT_ORDER[b] ?? 99))) {
      html += `<div class="cat">${esc(CAT[c] || "Annet")}</div><ul class="rows">${byCat[c].sort((a, b) => a.name.localeCompare(b.name, "nb")).map(shopRow).join("")}</ul>`;
    }
    if (done.length) html += `<div class="cartlabel"><div class="cat" style="margin:0">I handlekurven</div></div><ul class="rows">${done.map(shopRow).join("")}</ul>`;
    html += `</section>`;
  }
  out.innerHTML = html;
}

function renderLager() {
  const pl = $("#places");
  pl.innerHTML = PLACES.map(p => {
    const list = itemsIn(p.id), bad = list.filter(needs).length;
    return `<button type="button" data-act="place" data-place="${p.id}" aria-pressed="${p.id === S.place}">${p.short}
      <small class="${bad ? "alert" : ""}">${bad ? bad + " mangler" : list.length + " varer"}</small></button>`;
  }).join("");
  const out = $("#lagerOut");
  if (S.status === "loading") { out.innerHTML = ""; return; }
  const list = itemsIn(S.place), p = PLACE[S.place];
  if (!S.items.size) {
    out.innerHTML = `<div class="empty"><h2>Hva står på hytta?</h2><p>Start med en ferdig liste over vanlige hyttevarer, fotografer skapene, eller legg inn selv.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="starter">Velg vanlige hyttevarer</button>
      <button class="btn" type="button" data-act="goto" data-tab="sjekk">Fotografer skapene</button>
      <button class="btn ghost" type="button" data-act="edit">Legg til selv</button></div></div>`;
    return;
  }
  let html = "";
  if (!list.length) html += `<div class="empty"><p>Ingen varer i ${esc(p.name.toLowerCase())} ennå.</p></div>`;
  else {
    html += `<ul class="rows">` + list.map(i => {
      const isFrys = i.place === "frys";
      const age = isFrys && monthsOld(i.frozen) >= 6;
      const sub = [];
      if (i.always) sub.push('<span class="fast">Fast</span>');
      if (isFrys && i.frozen) sub.push(`<span class="${age ? "age" : ""}">Frosset ${esc(monthLabel(i.frozen))}</span>`);
      else sub.push(esc(storeName(validStore(i.store))));
      const exp = expiryText(i); if (exp) sub.push(exp);
      return `<li>
        <button class="pill ${i.status}" type="button" data-act="cycle" data-id="${esc(i.id)}" aria-label="${esc(i.name)}: ${STATUS[i.status]}. Trykk for å endre">${STATUS[i.status] || "?"}</button>
        <button class="rname tap" type="button" data-act="edit" data-id="${esc(i.id)}"><span>${esc(i.name)}</span><small>${sub.join(" · ")}</small></button>
        ${isFrys ? `<div class="stepper"><button type="button" data-act="qty" data-d="-1" data-id="${esc(i.id)}" aria-label="Én mindre ${esc(i.name)}">−</button><span>${Number(i.qty) || 0}</span><button type="button" data-act="qty" data-d="1" data-id="${esc(i.id)}" aria-label="Én mer ${esc(i.name)}">+</button></div>` : ""}
      </li>`;
    }).join("") + `</ul>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1" type="button" data-act="edit">Legg til vare</button>
    <button class="btn" type="button" data-act="starter">Fra liste</button></div>`;
  html += `<p class="muted" style="font-size:13px;margin:8px 2px 0">Trykk på Nok, Lite eller Tomt for å endre. Det som er lite eller tomt havner på handlelisten.</p>`;
  out.innerHTML = html;
}

function renderSjekk() {
  const out = $("#sjekkOut");
  if (S.status === "loading") { out.innerHTML = ""; return; }
  let top = "";
  if (S.justDeparted) top = `<div class="banner go"><b>Siste steg før dere går:</b> ta bilder av skapene, så er handlelisten klar til neste tur.</div>`;
  else if (S.trip.mode === "hytta") top = `<button class="btn primary block" type="button" data-act="depart">Vi drar – start avreisen</button>`;
  else top = `<div class="banner">Dere er hjemme. Bildesjekken brukes vanligvis når dere drar fra hytta, men du kan bruke den når som helst.</div>`;
  out.innerHTML = top + `<div class="pcards" style="margin-top:12px">` + PLACES.map(p => {
    const list = itemsIn(p.id), bad = list.filter(needs).length;
    const lc = S.checks[p.id];
    const who = lc ? personName(lc.by) : "";
    const meta = `${list.length} varer${bad ? ` · <b>${bad} mangler</b>` : ""}${lc ? ` · sjekket ${esc(when(lc.at))}${who ? " av " + esc(who) : ""}` : " · ikke sjekket"}`;
    const note = p.id === "frys" ? `<p class="note">Bilder av fryseren blir ofte usikre. Tell heller med pluss og minus under Manuelt.</p>` : "";
    return `<div class="pcard"><div class="head"><h3>${p.name}</h3></div><div class="meta">${meta}</div>${note}
      <div class="acts"><button class="btn primary" type="button" data-act="photo" data-place="${p.id}">Ta bilder</button>
      <button class="btn" type="button" data-act="manual" data-place="${p.id}">Manuelt</button></div></div>`;
  }).join("") + `</div>`;
}

// ---------- Ark ----------
let sheetClose = null;
function openSheet(html, onClose) {
  const old = $("#sheetBody"), fresh = old.cloneNode(false);
  old.replaceWith(fresh); // nytt element, så gamle lyttere forsvinner
  fresh.innerHTML = `<div class="sheet-top"><div class="grab"></div><button class="sheet-x" type="button" data-close aria-label="Lukk">${ICON.x}</button></div>` + html;
  fresh.querySelector("[data-close]").addEventListener("click", closeSheet);
  $("#sheet").scrollTop = 0;
  $("#sheet").hidden = false; $("#backdrop").hidden = false;
  sheetClose = onClose || null;
  const f = fresh.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 50);
}
function closeSheet() {
  $("#sheet").hidden = true; $("#backdrop").hidden = true;
  const fn = sheetClose; sheetClose = null; if (fn) fn();
}
$("#backdrop").addEventListener("click", closeSheet);

// Dra arket ned for å lukke det (når det er scrollet helt til toppen).
(() => {
  const sh = $("#sheet");
  let y0 = 0, dy = 0, t0 = 0, dragging = false;
  const reset = () => { sh.style.transition = ""; sh.style.transform = ""; };
  sh.addEventListener("touchstart", e => {
    dragging = sh.scrollTop <= 0 && e.touches.length === 1;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    sh.style.transition = "none";
  }, { passive: true });
  sh.addEventListener("touchmove", e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || sh.scrollTop > 0) { sh.style.transform = ""; if (dy < 0) dragging = false; return; }
    sh.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault(); // hindrer at siden bak scroller
  }, { passive: false });
  sh.addEventListener("touchend", () => {
    if (!dragging) { reset(); return; }
    dragging = false;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.5;
    sh.style.transition = "transform .18s ease-out";
    if (dy > 110 || (dy > 40 && fast)) {
      sh.style.transform = "translateY(100%)";
      setTimeout(() => { reset(); closeSheet(); }, 170);
    } else {
      sh.style.transform = "";
      setTimeout(reset, 180);
    }
  });
})();
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

function segHtml(name, opts, val, legend) {
  return `<fieldset class="seg"><legend>${legend}</legend>${opts.map(([v, l]) =>
    `<input type="radio" name="${name}" id="${name}-${v}" value="${v}" ${v === val ? "checked" : ""}><label for="${name}-${v}">${esc(l)}</label>`).join("")}</fieldset>`;
}

function openEdit(id) {
  const it = id ? S.items.get(id) : null;
  const v = it || { name: "", place: S.place, category: PLACE[S.place].cat, store: stores()[0].id, always: true, status: "ok", qty: 1, frozen: thisMonth() };
  openSheet(`<h2>${it ? "Endre vare" : "Ny vare"}</h2>
    <form id="editForm" style="display:flex;flex-direction:column;gap:14px" autocomplete="off">
      <label class="field">Navn<input id="f-name" value="${esc(v.name)}" required maxlength="80" ${it ? "" : "autofocus"} enterkeyhint="done"></label>
      ${segHtml("f-place", PLACES.map(p => [p.id, p.name]), v.place, "Hvor står den")}
      ${segHtml("f-status", Object.entries(STATUS), v.status, "Status")}
      <div class="row2">
        <label class="field">Kjøpes i<select id="f-store">${stores().map(s => `<option value="${esc(s.id)}" ${s.id === validStore(v.store) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <label class="field">Kategori<select id="f-cat">${CATS.map(([k, l]) => `<option value="${k}" ${k === v.category ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="row2" id="frysFields" ${v.place === "frys" ? "" : "hidden"}>
        <label class="field">Antall<input id="f-qty" type="number" inputmode="numeric" min="0" value="${Number(v.qty) || 0}"></label>
        <label class="field">Frosset<input id="f-frozen" type="month" value="${esc(v.frozen || thisMonth())}"></label>
      </div>
      <div class="row2" id="shelfFields" ${v.place === "frys" || v.place === "hus" ? "hidden" : ""}>
        <label class="field">Holder seg<select id="f-shelf">${SHELF_OPTIONS.map(([k, l]) => `<option value="${k}" ${String(v.shelfDays || "") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Best før<input id="f-exp" type="date" value="${esc(v.expiresOn || "")}"></label>
      </div>
      <label class="toggle"><input type="checkbox" id="f-fast" ${v.always ? "checked" : ""}><span>Fast vare<small>Skal alltid være på hytta. Bildesjekken setter den til Tomt i stedet for å fjerne den.</small></span></label>
      <div class="foot">
        ${it ? `<button type="button" class="btn danger" id="f-del">Slett</button>` : `<button type="button" class="btn ghost" id="f-cancel">Avbryt</button>`}
        <button type="submit" class="btn primary">${it ? "Lagre" : "Legg til"}</button>
      </div>
    </form>`);
  const form = $("#editForm");
  form.addEventListener("change", e => {
    if (e.target.name === "f-place") {
      $("#frysFields").hidden = e.target.value !== "frys";
      $("#shelfFields").hidden = e.target.value === "frys" || e.target.value === "hus";
      if (!it) $("#f-cat").value = PLACE[e.target.value].cat;
    }
  });
  const del = $("#f-del");
  if (del) del.addEventListener("click", async () => {
    if (del.dataset.armed) { closeSheet(); if (await itemDelete(id)) toast(`${it.name} er slettet`); return; }
    del.dataset.armed = "1"; del.textContent = "Trykk igjen for å slette";
  });
  const cancel = $("#f-cancel"); if (cancel) cancel.addEventListener("click", closeSheet);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#f-name").value.trim(); if (!name) return;
    const place = form.querySelector('input[name="f-place"]:checked').value;
    const status = form.querySelector('input[name="f-status"]:checked').value;
    const data = { name, place, status, store: $("#f-store").value, category: $("#f-cat").value, always: $("#f-fast").checked };
    if (place !== "frys" && place !== "hus") {
      data.shelfDays = parseInt($("#f-shelf").value, 10) || null;
      data.expiresOn = $("#f-exp").value || null;
    }
    if (it && status === "ok" && it.status !== "ok") data.stockedAt = Date.now();
    if (place === "frys") { data.qty = Math.max(0, parseInt($("#f-qty").value, 10) || 0); data.frozen = $("#f-frozen").value || thisMonth(); }
    closeSheet();
    if (it) { if (await itemUpdate(id, data)) toast("Lagret"); }
    else { S.place = place; if (await itemAdd(data)) toast(`${name} er lagt til`); }
  });
}

function openStarter() {
  const have = new Set([...S.items.values()].map(i => norm(i.name)));
  let html = `<h2>Vanlige hyttevarer</h2><p class="lead">Trykk på det dere vil ha på lageret. Det legges inn som fast vare med status Nok.</p>
    <button class="linkbtn" type="button" id="st-all">Velg alle</button><div class="starter">`;
  for (const p of PLACES) {
    const left = STARTER[p.id].filter(([n]) => !have.has(norm(n)));
    if (!left.length) continue;
    html += `<h3>${p.name}</h3><div class="grid">` + left.map(([n, c]) =>
      `<label><input type="checkbox" data-name="${esc(n)}" data-place="${p.id}" data-cat="${c}">${esc(n)}</label>`).join("") + `</div>`;
  }
  html += `</div><div class="foot"><button class="btn ghost" type="button" id="st-cancel">Avbryt</button><button class="btn primary" type="button" id="st-add">Legg til</button></div>`;
  openSheet(html);
  const upd = () => { const n = document.querySelectorAll(".starter input:checked").length; $("#st-add").textContent = n ? `Legg til ${n} vare${n === 1 ? "" : "r"}` : "Velg varer"; $("#st-add").disabled = !n; };
  upd();
  $("#sheetBody").addEventListener("change", upd);
  $("#st-cancel").addEventListener("click", closeSheet);
  $("#st-all").addEventListener("click", () => {
    const boxes = [...document.querySelectorAll(".starter input")];
    const all = boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = !all; });
    $("#st-all").textContent = all ? "Velg alle" : "Fjern alle";
    upd();
  });
  $("#st-add").addEventListener("click", async () => {
    const picks = [...document.querySelectorAll(".starter input:checked")].map(i => ({ name: i.dataset.name, place: i.dataset.place, category: i.dataset.cat }));
    closeSheet();
    const res = await Promise.all(picks.map(p => itemAdd({ ...p, store: stores()[0].id, always: true, status: "ok", qty: 1, shelfDays: p.place === "kjol" ? STARTER_SHELF[p.name] : null })));
    toast(`${res.filter(Boolean).length} varer lagt inn`);
    go("lager");
  });
}

function openMove(kind, id) {
  const cur = kind === "item" ? S.items.get(id) : S.extras.get(id);
  if (!cur) return;
  const apply = sid => (kind === "item" ? itemUpdate(id, { store: sid }) : extraUpdate(id, { store: sid }));
  if (stores().length === 2) { const other = stores().find(s => s.id !== validStore(cur.store)); apply(other.id); toast(`${cur.name} flyttet til ${other.name}`); return; }
  openSheet(`<h2>Kjøp ${esc(cur.name)} i</h2><div style="display:grid;gap:8px">${stores().map(s =>
    `<button class="btn ${s.id === validStore(cur.store) ? "primary" : ""}" type="button" data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>`);
  $("#sheetBody").addEventListener("click", e => { const b = e.target.closest("[data-sid]"); if (!b) return; closeSheet(); apply(b.dataset.sid); });
}

function openSettings(first) {
  const nm = myName();
  openSheet(`<h2>${first ? "Hvem er du?" : "Innstillinger"}</h2>
    <p class="lead">${first ? "Så dere ser hvem som har endret hva." : `Logget inn som ${esc(S.user?.email || "")}.`}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn ${nm === "Jonas" ? "primary" : ""}" type="button" data-who="Jonas">Jonas</button>
      <button class="btn ${nm === "Christina" ? "primary" : ""}" type="button" data-who="Christina">Christina</button>
    </div>
    ${first ? "" : `<h3 style="font-size:17px;margin-top:6px">Butikker</h3>
    <ul class="storelist">${stores().map(s => {
      const used = [...S.items.values()].filter(i => validStore(i.store) === s.id).length + [...S.extras.values()].filter(x => validStore(x.store) === s.id).length;
      return `<li><span>${esc(s.name)}</span><small>${used} varer</small>${stores().length > 1 && !used ? `<button class="iconbtn" type="button" data-rmstore="${esc(s.id)}" aria-label="Fjern ${esc(s.name)}">${ICON.x}</button>` : ""}</li>`;
    }).join("")}</ul>
    <form id="storeForm" class="addbar"><label class="sr" for="storeName">Ny butikk</label><input id="storeName" placeholder="Ny butikk, f.eks. Vinmonopolet" maxlength="40"><button class="btn" type="submit">Legg til</button></form>
    <p class="muted" style="font-size:13px;margin:0">En butikk kan fjernes når ingen varer kjøpes der.</p>
    <h3 style="font-size:17px;margin-top:6px">Hyttas posisjon</h3>
    <p class="muted" style="font-size:13px;margin:0">${hasCabin() ? "Lagret. Appen foreslår «Vi er på hytta» og «Vi drar» ut fra hvor du er." : "Ikke lagret ennå. Den lagres første gang noen trykker «Vi er på hytta» på hytta."}</p>
    <button class="btn" type="button" id="setCabin">Lagre der jeg står nå som hytta</button>
    <button class="btn" type="button" id="changePw">Bytt passord</button>
    <button class="btn ghost danger" type="button" id="signOut">Logg ut</button>`}`);
  const body = $("#sheetBody");
  body.addEventListener("click", async e => {
    const w = e.target.closest("[data-who]");
    if (w) { closeSheet(); await setName(w.dataset.who); if (first && S.offerPassword) openSetPassword(); return; }
    const r = e.target.closest("[data-rmstore]");
    if (r) { closeSheet(); if (await save(() => backend.stores.remove(r.dataset.rmstore))) toast("Butikken er fjernet"); }
  });
  const sf = $("#storeForm");
  if (sf) sf.addEventListener("submit", async e => {
    e.preventDefault(); const n = $("#storeName").value.trim(); if (!n) return;
    closeSheet();
    const sort = Math.max(0, ...stores().map(s => s.sort || 0)) + 1;
    if (await save(() => backend.stores.add({ id: "s" + Date.now().toString(36), name: n, sort }))) toast(`${n} er lagt til`);
  });
  const so = $("#signOut");
  if (so) so.addEventListener("click", async () => { closeSheet(); await backend.signOut(); });
  const cp = $("#changePw");
  if (cp) cp.addEventListener("click", openSetPassword);
  const sc = $("#setCabin");
  if (sc) sc.addEventListener("click", async () => {
    sc.disabled = true; sc.textContent = "Finner posisjonen …";
    const pos = await getPosition(true);
    closeSheet();
    if (!pos) { toast("Fikk ikke tak i posisjonen. Sjekk at appen har lov til å bruke stedstjenester."); return; }
    if (await save(() => backend.setTrip({ cabinLat: pos.lat, cabinLng: pos.lng }))) toast("Hyttas posisjon er lagret");
  });
}
async function setName(n) {
  if (await save(() => backend.setName(S.uid, n))) render();
}

// ---------- Vi drar ----------
function openDepart() {
  const list = riskList(Date.now() + UNKNOWN_RETURN_DAYS * DAY).filter(i => i.place !== "frys");
  openSheet(`<h2>Vi drar</h2>
    <p class="lead">${list.length ? "Dette holder trolig ikke til neste tur. Ta det med eller kast det. Fjern haken på det som skal stå." : "Ingen ferskvarer å ta med. God tur hjem!"}</p>
    ${list.length ? `<ul class="props">${list.map(i => `<li>
      <input type="checkbox" id="dp-${esc(i.id)}" data-id="${esc(i.id)}" checked>
      <label class="main" for="dp-${esc(i.id)}"><span>${esc(i.name)}</span><small>${esc(PLACE[i.place]?.name || "")} · holder til ca. ${esc(fmtDay(expiresAt(i)))}</small></label>
    </li>`).join("")}</ul>` : ""}
    <div class="foot"><button class="btn ghost" type="button" id="dp-cancel">Avbryt</button><button class="btn primary" type="button" id="dp-save">Vi drar</button></div>`);
  $("#dp-cancel").addEventListener("click", closeSheet);
  $("#dp-save").addEventListener("click", async () => {
    const gone = [...document.querySelectorAll("#sheetBody input[data-id]:checked")].map(b => S.items.get(b.dataset.id)).filter(Boolean);
    closeSheet();
    const jobs = gone.map(i => (i.always ? itemUpdate(i.id, { status: "tomt" }) : itemDelete(i.id)));
    jobs.push(save(() => backend.setTrip({ mode: "hjemme", nextTrip: null })));
    await Promise.all(jobs);
    S.where = null; S.justDeparted = true;
    go("sjekk");
    toast("God tur hjem!");
  });
}

// ---------- Vi er på hytta ----------
function openArrive() {
  const list = riskList(Date.now() + DAY).filter(i => i.place !== "frys");
  openSheet(`<h2>Velkommen til hytta</h2>
    <p class="lead">${list.length ? "Disse har trolig gått ut mens dere var borte. La haken stå på det dere kaster." : "Ingen ferskvarer å sjekke. God tur!"}</p>
    ${list.length ? `<ul class="props">${list.map(i => `<li>
      <input type="checkbox" id="ar-${esc(i.id)}" data-id="${esc(i.id)}" checked>
      <label class="main" for="ar-${esc(i.id)}"><span>${esc(i.name)}</span><small>Kast · holdt til ca. ${esc(fmtDay(expiresAt(i)))}</small></label>
    </li>`).join("")}</ul>` : ""}
    <div class="foot"><button class="btn ghost" type="button" id="ar-cancel">Avbryt</button><button class="btn primary" type="button" id="ar-save">Vi er på hytta</button></div>`);
  $("#ar-cancel").addEventListener("click", closeSheet);
  $("#ar-save").addEventListener("click", async () => {
    const boxes = [...document.querySelectorAll('#sheetBody input[data-id]')];
    closeSheet();
    const recheck = isoDay(Date.now() + 3 * DAY);
    const jobs = boxes.map(b => {
      const i = S.items.get(b.dataset.id); if (!i) return true;
      if (!b.checked) return itemUpdate(i.id, { expiresOn: recheck }); // fortsatt bra: sjekk igjen om tre dager
      return i.always ? itemUpdate(i.id, { status: "tomt" }) : itemDelete(i.id);
    });
    jobs.push(save(() => backend.setTrip({ mode: "hytta", nextTrip: null })));
    await Promise.all(jobs);
    S.justDeparted = false; S.where = null;
    if (!hasCabin()) {
      // Første gang: bruk posisjonen her som hyttas posisjon.
      getPosition(true).then(pos => {
        if (pos) save(() => backend.setTrip({ cabinLat: pos.lat, cabinLng: pos.lng })).then(ok => { if (ok) toast("Hyttas posisjon er lagret"); });
      });
    }
    go("liste");
    toast("Velkommen til hytta!");
  });
}

// ---------- Planleggeren ----------
let planForm = { days: 3, people: 2, mealTypes: ["middag"], wishes: "" };
try { const f = JSON.parse(localStorage.getItem("hytte-planform") || "null"); if (f) planForm = { ...planForm, ...f, wishes: "" }; } catch (e) {}

const inventoryForPlan = () => [...S.items.values()].map(i => ({ name: i.name, status: i.status }));
function onListNames() {
  const set = new Set();
  for (const x of S.extras.values()) if (!x.done) set.add(norm(x.name));
  for (const i of S.items.values()) if (needs(i)) set.add(norm(i.name));
  return set;
}
// Det som må kjøpes til planen, slått sammen på tvers av rettene
function planNeeds(plan) {
  const atCabin = new Set([...S.items.values()].filter(i => i.status !== "tomt").map(i => norm(i.name)));
  const map = new Map();
  for (const m of plan.meals || []) for (const g of m.ingredients || []) {
    const k = norm(g.name);
    if (g.have || atCabin.has(k)) continue;
    const e = map.get(k) || { name: g.name, category: g.category, amounts: [], meals: [] };
    if (g.amount) e.amounts.push(g.amount);
    if (!e.meals.includes(m.title)) e.meals.push(m.title);
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => (CAT_ORDER[a.category] ?? 99) - (CAT_ORDER[b.category] ?? 99) || a.name.localeCompare(b.name, "nb"));
}
const needNote = n => `${n.amounts.join(" + ")}${n.amounts.length ? " · " : ""}${n.meals.join(", ")}`;

function renderPlan() {
  const out = $("#planOut");
  if (S.status === "loading") { out.innerHTML = ""; return; }
  const busy = S.planBusy;
  if (busy && busy.kind === "new") {
    out.innerHTML = `<div class="busy"><div class="spinner" aria-hidden="true"></div><h2>Lager menyforslag</h2>
      <p class="muted" style="margin:0">Ser på ønskene og det som står på hytta. Det tar gjerne 20–40 sekunder.</p>
      <button class="btn" type="button" data-act="plan-stop">Stopp</button></div>`;
    return;
  }
  const plan = S.plan;
  if (!plan || !plan.meals?.length) { out.innerHTML = planFormHtml(); return; }

  const days = [...new Set(plan.meals.map(m => m.day))].sort((a, b) => a - b);
  const order = { frokost: 0, lunsj: 1, middag: 2 };
  let html = `<div class="planhead"><h2>Menyen</h2><small>${plan.days} dag${plan.days === 1 ? "" : "er"} · ${plan.people} pers.</small></div>`;
  if (plan.wishes) html += `<p class="muted" style="margin:0;font-size:14px">Ønsker: ${esc(plan.wishes)}</p>`;
  for (const d of days) {
    html += `<div class="dayblock"><div class="daylabel">Dag ${d}</div>`;
    plan.meals.map((m, i) => [m, i]).filter(([m]) => m.day === d).sort((a, b) => order[a[0].type] - order[b[0].type]).forEach(([m, i]) => {
      const isBusy = busy && busy.kind === "replace" && busy.index === i;
      html += `<div class="meal ${isBusy ? "busy" : ""}">
        <div class="mtop"><div><div class="mtype">${MEAL_LABEL[m.type] || ""}</div><h3>${esc(isBusy ? "Finner en annen rett …" : m.title)}</h3></div>
        <button class="chipbtn" type="button" data-act="plan-swap" data-i="${i}" ${busy ? "disabled" : ""}>Bytt</button></div>
        ${isBusy ? "" : `<p>${esc(m.description)}</p>
        <div class="ingr">${(m.ingredients || []).map(g => `<span class="${g.have ? "have" : ""}">${esc(g.name)}${g.amount ? " " + esc(g.amount) : ""}</span>`).join("")}</div>`}
      </div>`;
    });
    html += `</div>`;
  }
  const needs = planNeeds(plan), onList = onListNames();
  const toAdd = needs.filter(n => !onList.has(norm(n.name)));
  html += `<div class="buybox"><h3>Må kjøpes</h3>`;
  if (!needs.length) html += `<p class="muted" style="margin:0">Alt står allerede på hytta.</p>`;
  else html += `<ul>${needs.map(n => `<li class="${onList.has(norm(n.name)) ? "onlist" : ""}"><span>${esc(n.name)}</span><small>${onList.has(norm(n.name)) ? "på listen" : esc(n.amounts.join(" + "))}</small></li>`).join("")}</ul>`;
  html += toAdd.length
    ? `<button class="btn primary block" type="button" data-act="plan-add" ${busy ? "disabled" : ""}>Legg ${toAdd.length} vare${toAdd.length === 1 ? "" : "r"} på handlelisten</button>`
    : needs.length ? `<p class="muted" style="margin:0;font-size:14px">Alt står på handlelisten.</p>` : "";
  html += `</div>
    <button class="btn ghost block" type="button" data-act="plan-new" ${busy ? "disabled" : ""}>Lag en ny plan</button>`;
  out.innerHTML = html;
}

function planFormHtml() {
  const f = planForm;
  return `<form class="planform" id="planForm" autocomplete="off">
    <h2>Planleggeren</h2>
    <p class="lead">Fortell hva dere har lyst på, så lager Claude en meny og handleliste. Det som står på hytta, trekkes fra.</p>
    <div class="steprow">Antall dager<div class="stepper"><button type="button" data-step="days" data-d="-1" aria-label="Færre dager">−</button><span id="pf-days">${f.days}</span><button type="button" data-step="days" data-d="1" aria-label="Flere dager">+</button></div></div>
    <div class="steprow">Antall personer<div class="stepper"><button type="button" data-step="people" data-d="-1" aria-label="Færre personer">−</button><span id="pf-people">${f.people}</span><button type="button" data-step="people" data-d="1" aria-label="Flere personer">+</button></div></div>
    <div><div class="cat" style="margin:0 0 6px">Måltider</div><div class="mealpick">${Object.entries(MEAL_LABEL).map(([k, l]) =>
      `<label><input type="checkbox" name="pf-meal" value="${k}" ${f.mealTypes.includes(k) ? "checked" : ""}>${l}</label>`).join("")}</div></div>
    <label class="field">Hva har dere lyst på?<textarea id="pf-wishes" placeholder="F.eks. taco én dag, fisk, noe enkelt første kveld, ingen sopp">${esc(f.wishes)}</textarea></label>
    <button class="btn primary block" type="submit">Lag menyforslag</button>
  </form>`;
}

function readPlanForm() {
  const types = [...document.querySelectorAll('input[name="pf-meal"]:checked')].map(i => i.value);
  planForm = { ...planForm, mealTypes: types, wishes: ($("#pf-wishes")?.value || "").trim() };
  try { localStorage.setItem("hytte-planform", JSON.stringify({ days: planForm.days, people: planForm.people, mealTypes: planForm.mealTypes })); } catch (e) {}
  return planForm;
}

const planError = e => (ERRORS[e?.code] || ["Fikk ikke et menyforslag. Prøv igjen."])[0];

async function makePlan() {
  const f = readPlanForm();
  if (!f.mealTypes.length) { toast("Velg minst ett måltid"); return; }
  const ctl = new AbortController();
  S.planBusy = { kind: "new", ctl }; renderPlan();
  try {
    const res = await backend.planMenu({ days: f.days, people: f.people, mealTypes: f.mealTypes, wishes: f.wishes, inventory: inventoryForPlan() }, ctl.signal);
    await save(() => backend.savePlan({ days: f.days, people: f.people, mealTypes: f.mealTypes, wishes: f.wishes, meals: res.meals, createdAt: Date.now() }));
  } catch (e) {
    if (e?.code !== "cancelled") toast(planError(e));
  } finally {
    S.planBusy = null; renderPlan();
  }
}

function openSwap(index) {
  const m = S.plan?.meals?.[index]; if (!m) return;
  openSheet(`<h2>Bytt ${esc(MEAL_LABEL[m.type].toLowerCase())} dag ${m.day}</h2>
    <p class="lead">I stedet for ${esc(m.title)}. Skriv gjerne hva du har lyst på, eller la feltet stå tomt.</p>
    <form id="swapForm" style="display:flex;flex-direction:column;gap:12px" autocomplete="off">
      <label class="field">Ønske<input id="sw-wish" placeholder="F.eks. noe med kylling" maxlength="300" enterkeyhint="go"></label>
      <div class="foot"><button class="btn ghost" type="button" id="sw-cancel">Avbryt</button><button class="btn primary" type="submit">Finn en annen rett</button></div>
    </form>`);
  $("#sw-cancel").addEventListener("click", closeSheet);
  $("#swapForm").addEventListener("submit", e => { e.preventDefault(); const w = $("#sw-wish").value.trim(); closeSheet(); swapMeal(index, w); });
}

async function swapMeal(index, wish) {
  const plan = S.plan, m = plan.meals[index];
  S.planBusy = { kind: "replace", index }; renderPlan();
  try {
    const res = await backend.planMenu({
      days: plan.days, people: plan.people, mealTypes: plan.mealTypes, wishes: plan.wishes || "", inventory: inventoryForPlan(),
      replace: { day: m.day, type: m.type, wish, oldTitle: m.title, otherTitles: plan.meals.filter((_, j) => j !== index).map(x => x.title) },
    });
    const meals = plan.meals.slice(); meals[index] = { ...res.meal, day: m.day, type: m.type };
    await save(() => backend.savePlan({ ...plan, meals }));
  } catch (e) {
    toast(planError(e));
  } finally {
    S.planBusy = null; renderPlan();
  }
}

async function addPlanToList() {
  const onList = onListNames();
  const toAdd = planNeeds(S.plan).filter(n => !onList.has(norm(n.name)));
  if (!toAdd.length) return;
  const store = stores()[0].id;
  const res = await Promise.all(toAdd.map(n => save(() => backend.extras.add({
    name: n.name, store, done: false, category: CAT[n.category] ? n.category : "annet", note: needNote(n).slice(0, 200), ...by(),
  }))));
  const ok = res.filter(Boolean).length;
  if (ok) { toast(`${ok} vare${ok === 1 ? "" : "r"} lagt på handlelisten`); go("liste"); }
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-step]"); if (!b) return;
  const key = b.dataset.step, max = key === "days" ? 14 : 12;
  planForm[key] = Math.min(max, Math.max(1, planForm[key] + Number(b.dataset.d)));
  $("#pf-" + key).textContent = planForm[key];
});
document.addEventListener("submit", e => {
  if (e.target.id !== "planForm") return;
  e.preventDefault(); makePlan();
});

// ---------- Bildesjekk ----------
let photo = null;
function startPhoto(place) {
  photo = { place, files: [], urls: [], ctl: null, proposals: [], state: "pick" };
  const fi = $("#fileIn"); fi.value = ""; fi.click();
}
$("#fileIn").addEventListener("change", e => {
  if (!photo) return;
  const files = [...e.target.files].filter(f => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return;
  for (const f of files) { photo.files.push(f); photo.urls.push(URL.createObjectURL(f)); }
  photo.state = "pick"; renderPhoto();
});
function cleanupPhoto() {
  if (!photo) return;
  if (photo.ctl) photo.ctl.abort();
  photo.urls.forEach(u => URL.revokeObjectURL(u));
  photo = null;
}
function renderPhoto() {
  const p = PLACE[photo.place];
  if (photo.state === "pick") {
    const over = photo.files.length > MAX_IMAGES;
    openSheet(`<h2>${p.name}</h2><p class="lead">${photo.files.length} bilde${photo.files.length === 1 ? "" : "r"}. Ta med alle hyllene, gjerne med døra helt åpen.</p>
      <div class="thumbs">${photo.urls.map((u, i) => `<div><img src="${u}" alt="Bilde ${i + 1}"><button type="button" data-rm="${i}" aria-label="Fjern bilde ${i + 1}">×</button></div>`).join("")}
      <button type="button" class="addph" id="ph-more">+ Flere</button></div>
      ${over ? `<p class="muted" style="font-size:13px;margin:0">Bare de ${MAX_IMAGES} første bildene blir sjekket.</p>` : ""}
      <div class="foot"><button class="btn ghost" type="button" id="ph-cancel">Avbryt</button><button class="btn primary" type="button" id="ph-go" ${photo.files.length ? "" : "disabled"}>Sjekk bildene</button></div>`, cleanupPhoto);
    $("#sheetBody").addEventListener("click", e => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { const i = +rm.dataset.rm; URL.revokeObjectURL(photo.urls[i]); photo.urls.splice(i, 1); photo.files.splice(i, 1); renderPhoto(); }
    });
    $("#ph-more").addEventListener("click", () => { const fi = $("#fileIn"); fi.value = ""; fi.click(); });
    $("#ph-cancel").addEventListener("click", closeSheet);
    $("#ph-go").addEventListener("click", analyze);
    return;
  }
  if (photo.state === "busy") {
    openSheet(`<div class="busy"><div class="spinner" aria-hidden="true"></div><h2>Ser gjennom ${p.name.toLowerCase()}</h2>
      <p class="muted" style="margin:0">Sammenligner bildene med lageret. Det tar gjerne 20–60 sekunder.</p>
      <button class="btn" type="button" id="ph-stop">Stopp</button></div>`, cleanupPhoto);
    $("#ph-stop").addEventListener("click", () => { if (photo && photo.ctl) photo.ctl.abort(); });
    return;
  }
  if (photo.state === "error") {
    openSheet(`<h2>Det gikk ikke</h2><p class="lead">${esc(photo.error)}</p>
      <div class="foot"><button class="btn ghost" type="button" id="ph-close">Lukk</button>${photo.retry ? `<button class="btn primary" type="button" id="ph-retry">Prøv igjen</button>` : ""}</div>`, cleanupPhoto);
    $("#ph-close").addEventListener("click", closeSheet);
    const r = $("#ph-retry"); if (r) r.addEventListener("click", analyze);
    return;
  }
  if (photo.state === "review") renderReview();
}

// Gjør bildene mindre før opplasting (1280 px på lengste side, JPEG).
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
    if (!blob) throw new Error("toBlob");
    return blob;
  } catch (e) {
    throw { code: "image_rejected" };
  }
}

const ERRORS = {
  rate_limited: ["Bildesjekken er overbelastet akkurat nå. Prøv igjen om litt.", true],
  image_rejected: ["Et av bildene kunne ikke leses. Fjern det og ta et nytt.", false],
  not_member: ["Kontoen din har ikke tilgang til bildesjekken.", false],
  not_signed_in: ["Du er logget ut. Logg inn på nytt.", false],
  server_config: ["Bildesjekken er ikke satt opp riktig på serveren ennå.", false],
  refused: ["Claude ville ikke vurdere disse bildene. Prøv andre bilder, eller gå gjennom skapet manuelt.", false],
  offline: ["Ingen nettforbindelse. Prøv igjen når du har dekning.", true],
  bad_request: ["Bildene var for store eller for mange. Prøv med færre bilder.", false],
};

async function analyze() {
  if (!photo) return;
  const place = photo.place;
  const known = itemsIn(place).map(i => ({ id: i.id, name: i.name, status: i.status }));
  photo.state = "busy"; photo.ctl = new AbortController(); renderPhoto();
  try {
    const blobs = await Promise.all(photo.files.slice(0, MAX_IMAGES).map(shrink));
    if (!photo || !photo.ctl) return;
    const res = await backend.analyze(place, known, blobs, photo.ctl.signal);
    if (!photo) return;
    photo.ctl = null;
    photo.proposals = buildProposals(place, res);
    photo.state = "review"; renderPhoto();
  } catch (e) {
    if (!photo) return;
    photo.ctl = null;
    const code = e && e.code;
    if (code === "cancelled") { photo.state = "pick"; renderPhoto(); return; }
    if (code === "image_rejected") { photo.state = "pick"; toast(ERRORS.image_rejected[0]); renderPhoto(); return; }
    const [msg, retry] = ERRORS[code] || ["Fikk ikke et svar som kunne brukes. Prøv igjen.", true];
    photo.error = msg; photo.retry = retry;
    photo.state = "error"; renderPhoto();
  }
}

function buildProposals(place, res) {
  const out = [];
  const items = Array.isArray(res && res.items) ? res.items : [];
  const seenIds = new Set();
  for (const r of items) {
    const it = S.items.get(String(r && r.id));
    if (!it || it.place !== place || seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    const seen = String(r.seen || "").toLowerCase();
    if (seen === "nei") {
      if (it.always) { if (it.status !== "tomt") out.push({ group: "change", type: "status", id: it.id, to: "tomt", on: true, title: it.name, sub: `Fant den ikke · ${STATUS[it.status]} → Tomt` }); }
      else out.push({ group: "change", type: "remove", id: it.id, on: true, title: it.name, sub: "Fant den ikke · fjern fra lageret" });
    } else if (seen === "ja") {
      const lvl = STATUS[r.level] ? r.level : "ok";
      if (lvl !== it.status) out.push({ group: "change", type: "status", id: it.id, to: lvl, on: true, title: it.name, sub: `${STATUS[it.status]} → ${STATUS[lvl]}` });
    } else if (it.status !== "tomt") {
      out.push({ group: "unsure", type: it.always ? "status" : "remove", id: it.id, to: "tomt", on: false, title: it.name, sub: it.always ? "Usikker · sett Tomt?" : "Usikker · fjern?" });
    }
  }
  const existing = new Set(itemsIn(place).map(i => norm(i.name)));
  const news = Array.isArray(res && res.new) ? res.new : [];
  for (const n of news) {
    const name = String(n && n.name || "").trim().slice(0, 80);
    if (!name || existing.has(norm(name))) continue;
    existing.add(norm(name));
    const lvl = STATUS[n.level] ? n.level : "ok";
    const cat = CAT[n.category] ? n.category : PLACE[place].cat;
    out.push({ group: "new", type: "add", on: true, name, title: name, category: cat,
      always: !!n.staple, status: lvl, qty: Math.max(1, parseInt(n.count, 10) || 1),
      shelfDays: Number.isInteger(n.shelf_days) && n.shelf_days > 0 && n.shelf_days < 3650 ? n.shelf_days : null,
      sub: `${CAT[cat]}${lvl !== "ok" ? " · " + STATUS[lvl] : ""}` });
  }
  return out;
}

function renderReview() {
  const p = PLACE[photo.place], props = photo.proposals;
  const sect = (g, label) => {
    const list = props.map((x, i) => [x, i]).filter(([x]) => x.group === g);
    if (!list.length) return "";
    return `<div class="subhead">${label}</div><ul class="props">${list.map(([x, i]) => `<li>
      <input type="checkbox" id="pr-${i}" data-i="${i}" ${x.on ? "checked" : ""}>
      <label class="main" for="pr-${i}"><span>${esc(x.title)}</span><small>${esc(x.sub)}</small></label>
      ${x.type === "add" ? `<label class="fastsel"><input type="checkbox" data-fast="${i}" ${x.always ? "checked" : ""}>Fast</label>` : ""}
    </li>`).join("")}</ul>`;
  };
  const none = !props.length;
  openSheet(`<h2>${p.name}: forslag</h2>
    <p class="lead">${none ? "Alt ser ut til å stemme med lageret." : "Fjern haken på det som er feil, og lagre."}</p>
    ${sect("change", "Endringer")}${sect("new", "Nye varer")}${sect("unsure", "Usikre – ikke valgt")}
    <div class="foot"><button class="btn ghost" type="button" id="rv-cancel">${none ? "Lukk" : "Avbryt"}</button>
    <button class="btn primary" type="button" id="rv-save"></button></div>`, cleanupPhoto);
  const upd = () => { const n = props.filter(x => x.on).length; $("#rv-save").textContent = n ? `Lagre ${n} endring${n === 1 ? "" : "er"}` : "Merk som sjekket"; };
  upd();
  $("#sheetBody").addEventListener("change", e => {
    const i = e.target.dataset.i, f = e.target.dataset.fast;
    if (i != null) props[+i].on = e.target.checked;
    if (f != null) props[+f].always = e.target.checked;
    upd();
  });
  $("#rv-cancel").addEventListener("click", closeSheet);
  $("#rv-save").addEventListener("click", async () => {
    const place = photo.place, chosen = props.filter(x => x.on);
    closeSheet();
    const jobs = chosen.map(x => {
      if (x.type === "status") return itemUpdate(x.id, {
        status: x.to,
        ...(x.to === "tomt" && S.items.get(x.id)?.place === "frys" ? { qty: 0 } : {}),
        ...(x.to === "ok" ? { stockedAt: Date.now(), expiresOn: null } : {}),
      });
      if (x.type === "remove") return itemDelete(x.id);
      return itemAdd({ name: x.name, place, category: x.category, store: stores()[0].id, always: x.always, status: x.status, qty: x.qty, shelfDays: x.shelfDays });
    });
    jobs.push(save(() => backend.markChecked(place, S.uid)));
    const res = await Promise.all(jobs);
    if (res.every(Boolean)) toast(chosen.length ? `${chosen.length} endring${chosen.length === 1 ? "" : "er"} lagret` : `${PLACE[place].name} er sjekket`);
  });
}

// ---------- Handlinger ----------
function go(tab) {
  S.tab = tab;
  if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (TABS.includes(t)) { S.tab = t; render(); } });
window.addEventListener("online", () => render());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.started) checkLocation(); });
window.addEventListener("offline", () => render());
for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => go(t.dataset.tab));
$("#meBtn").addEventListener("click", () => openSettings(false));
$("#addStore").addEventListener("click", () => {
  const list = stores(), i = list.findIndex(s => s.id === S.addStore);
  S.addStore = list[(i + 1) % list.length].id; $("#addStore").textContent = storeName(S.addStore);
});
$("#addForm").addEventListener("submit", async e => {
  e.preventDefault();
  const inp = $("#addName"), name = inp.value.trim().slice(0, 80); if (!name) return;
  inp.value = "";
  // Finnes varen i lageret allerede, settes den til Tomt i stedet for å lage en ny linje.
  const match = [...S.items.values()].find(i => norm(i.name) === norm(name));
  if (match) {
    if (!needs(match)) { if (await itemUpdate(match.id, { status: "tomt", store: S.addStore })) toast(`${match.name} satt til Tomt`); }
    else toast(`${match.name} står allerede på listen`);
    return;
  }
  if (!(await save(() => backend.extras.add({ name, store: S.addStore, done: false, ...by() })))) inp.value = name;
});

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || b.closest("#sheet")) return;
  const { act, id, kind } = b.dataset;
  if (act === "goto") return go(b.dataset.tab);
  if (act === "depart") return openDepart();
  if (act === "plan-stop") { S.planBusy?.ctl?.abort(); return; }
  if (act === "plan-swap") return openSwap(Number(b.dataset.i));
  if (act === "plan-add") return addPlanToList();
  if (act === "plan-new") {
    if (S.plan) planForm = { ...planForm, days: S.plan.days, people: S.plan.people, mealTypes: S.plan.mealTypes || planForm.mealTypes, wishes: "" };
    await save(() => backend.clearPlan());
    return renderPlan();
  }
  if (act === "arrive") return openArrive();
  if (act === "renew") {
    const it = S.items.get(id); if (!it) return;
    if (await itemUpdate(id, { status: "tomt" })) toast(`${it.name} er på handlelisten`);
    return;
  }
  if (act === "starter") return openStarter();
  if (act === "edit") return openEdit(id || null);
  if (act === "place") { S.place = b.dataset.place; try { localStorage.setItem("hytte-place", S.place); } catch (e) {} return renderLager(); }
  if (act === "manual") { S.place = b.dataset.place; try { localStorage.setItem("hytte-place", S.place); } catch (e) {} return go("lager"); }
  if (act === "photo") return startPhoto(b.dataset.place);
  if (act === "move") return openMove(kind, id);
  if (act === "cycle") {
    const it = S.items.get(id); if (!it) return;
    const to = NEXT[it.status] || "ok";
    const patch = { status: to, boughtAt: null };
    if (to === "ok") { patch.stockedAt = Date.now(); patch.expiresOn = null; }
    if (it.place === "frys") { if (to === "tomt") patch.qty = 0; else if (!(Number(it.qty) > 0)) patch.qty = 1; }
    return itemUpdate(id, patch);
  }
  if (act === "qty") {
    const it = S.items.get(id); if (!it) return;
    const q = Math.max(0, (Number(it.qty) || 0) + Number(b.dataset.d));
    const patch = { qty: q };
    if (q === 0) patch.status = "tomt"; else if (it.status === "tomt") { patch.status = "ok"; patch.stockedAt = Date.now(); }
    return itemUpdate(id, patch);
  }
  if (act === "buy") {
    if (kind === "extra") {
      const x = S.extras.get(id); if (!x) return;
      return extraUpdate(id, x.done ? { done: false, doneAt: null } : { done: true, doneAt: Date.now() });
    }
    const it = S.items.get(id); if (!it) return;
    if (boughtRecently(it)) return itemUpdate(id, { status: it.prevStatus || "tomt", boughtAt: null, ...(it.place === "frys" ? { qty: Number(it.prevQty) || 0 } : {}) });
    const patch = { prevStatus: it.status, status: "ok", boughtAt: Date.now(), stockedAt: Date.now(), expiresOn: null };
    if (it.place === "frys") { patch.prevQty = Number(it.qty) || 0; patch.qty = (Number(it.qty) || 0) + 1; patch.frozen = thisMonth(); }
    return itemUpdate(id, patch);
  }
  if (act === "drop") {
    if (kind === "extra") return extraDelete(id);
    const it = S.items.get(id); if (!it) return;
    if (await itemDelete(id)) toast(`${it.name} er fjernet fra lageret`);
  }
});

// ---------- Innlogging ----------
// Vanlig innlogging er e-post og passord. Kode på e-post brukes første gang og når passordet er glemt.
function lastEmail() { try { return localStorage.getItem("hytte-email") || ""; } catch (e) { return ""; } }
function rememberEmail(em) { try { localStorage.setItem("hytte-email", em); } catch (e) {} }

function showAuth(step, email, err) {
  $("#app").hidden = true; $("#auth").hidden = false;
  const body = $("#authBody");
  email = email ?? lastEmail();
  if (step === "nokey") {
    body.innerHTML = `<p>Appen mangler kobling til databasen. Sett VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY i Vercel og publiser på nytt.</p>`;
    return;
  }
  if (step === "denied") {
    body.innerHTML = `<p>${esc(email)} har ikke tilgang til dette lageret.</p><button class="linkbtn" type="button" id="au-out">Logg inn med en annen adresse</button>`;
    $("#au-out").addEventListener("click", () => backend.signOut());
    return;
  }
  if (step === "login") {
    body.innerHTML = `<form id="au-form">
      <label class="sr" for="au-email">E-post</label>
      <input id="au-email" type="email" autocomplete="username" inputmode="email" required value="${esc(email)}" placeholder="E-post">
      <label class="sr" for="au-pass">Passord</label>
      <input id="au-pass" type="password" autocomplete="current-password" required placeholder="Passord">
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <button class="btn primary block" type="submit">Logg inn</button>
      <button class="linkbtn" type="button" id="au-code">Første gang, eller glemt passordet? Få en kode på e-post</button></form>`;
    $("#au-code").addEventListener("click", () => showAuth("email", $("#au-email").value.trim()));
    $("#au-form").addEventListener("submit", async e => {
      e.preventDefault();
      const em = $("#au-email").value.trim(), pw = $("#au-pass").value;
      if (!em || !pw) return;
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Logger inn …";
      try { rememberEmail(em); await backend.signInWithPassword(em, pw); }
      catch (er) { showAuth("login", em, "Feil e-post eller passord. Har du ikke laget passord ennå, trykk «Få en kode på e-post»."); }
    });
    return;
  }
  if (step === "email") {
    body.innerHTML = `<form id="au-form"><p>Du får en kode på e-post. Etterpå kan du lage et passord.</p>
      <label class="sr" for="au-email">E-post</label>
      <input id="au-email" type="email" autocomplete="email" inputmode="email" required value="${esc(email)}" placeholder="navn@eksempel.no">
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <button class="btn primary block" type="submit">Send kode</button>
      <button class="linkbtn" type="button" id="au-have">Jeg har allerede en kode</button>
      <button class="linkbtn" type="button" id="au-pw">Logg inn med passord</button></form>`;
    $("#au-pw").addEventListener("click", () => showAuth("login", $("#au-email").value.trim()));
    $("#au-have").addEventListener("click", () => {
      const em = $("#au-email").value.trim();
      if (!em || !$("#au-email").checkValidity()) { $("#au-email").reportValidity(); return; }
      showAuth("code", em);
    });
    $("#au-form").addEventListener("submit", async e => {
      e.preventDefault();
      const em = $("#au-email").value.trim(); if (!em) return;
      const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = "Sender …";
      try { rememberEmail(em); await backend.sendCode(em); showAuth("code", em); }
      catch (er) { showAuth("email", em, er?.status === 429 ? "Vent noen minutter før du ber om en ny kode. Har du allerede fått en, trykk «Jeg har allerede en kode»." : "Klarte ikke å sende koden. Sjekk adressen og prøv igjen."); }
    });
    return;
  }
  body.innerHTML = `<form id="au-form"><p>Skriv inn koden som ble sendt til ${esc(email)}. Sjekk søppelpost hvis den ikke er kommet.</p>
    <label class="sr" for="au-code">Kode</label>
    <input id="au-code" class="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required autofocus>
    ${err ? `<p class="err">${esc(err)}</p>` : ""}
    <button class="btn primary block" type="submit">Logg inn</button>
    <button class="linkbtn" type="button" id="au-back">Tilbake</button></form>`;
  $("#au-code").focus();
  $("#au-back").addEventListener("click", () => showAuth("login", email));
  $("#au-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#au-code").value.replace(/\D/g, ""); if (!code) return;
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Logger inn …";
    S.offerPassword = true; // etter kode-innlogging: be om å lage passord
    try { await backend.verifyCode(email, code); }
    catch (er) { S.offerPassword = false; showAuth("code", email, "Koden stemmer ikke eller er utløpt. Prøv igjen, eller be om en ny."); }
  });
}

function openSetPassword() {
  S.offerPassword = false;
  openSheet(`<h2>Lag et passord</h2>
    <p class="lead">Da logger du inn med e-post og passord neste gang, uten kode. Minst 8 tegn.</p>
    <form id="pwForm" style="display:flex;flex-direction:column;gap:10px">
      <input type="email" autocomplete="username" value="${esc(S.user?.email || "")}" hidden>
      <label class="field">Nytt passord<input id="pw-new" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="err" id="pw-err" hidden></p>
      <div class="foot"><button class="btn ghost" type="button" id="pw-skip">Senere</button><button class="btn primary" type="submit">Lagre passord</button></div>
    </form>`);
  $("#pw-skip").addEventListener("click", closeSheet);
  $("#pwForm").addEventListener("submit", async e => {
    e.preventDefault();
    const pw = $("#pw-new").value;
    try { await backend.setPassword(pw); closeSheet(); toast("Passordet er lagret"); }
    catch (er) { const el = $("#pw-err"); el.hidden = false; el.textContent = "Klarte ikke å lagre passordet. Prøv et lengre passord."; }
  });
}

let entered = null;
async function enter(user) {
  if (!user) {
    if (S.started) { location.reload(); return; } // utlogget: start rent
    entered = null; S.user = null; S.uid = null; showAuth("login"); return;
  }
  if (entered === user.id) return;
  entered = user.id;
  S.user = user; S.uid = user.id;
  if (!(await backend.isMember())) { showAuth("denied", user.email); return; }
  $("#auth").hidden = true; $("#app").hidden = false;
  render();
  if (!S.started) {
    S.started = true;
    const slowT = setTimeout(() => { S.slow = true; render(); }, 10000);
    backend.subscribeData((data, status) => {
      if (status !== "loading") clearTimeout(slowT);
      S.status = status;
      S.items = new Map(data.items.map(r => [r.id, r]));
      S.extras = new Map(data.extras.map(r => [r.id, r]));
      S.stores = [...data.stores].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      S.checks = Object.fromEntries(data.place_checks.map(c => [c.place, c]));
      S.people = Object.fromEntries(data.profiles.map(p => [p.id, p.name]));
      S.trip = data.trip_state[0] || { mode: "hjemme", nextTrip: null, changedAt: null };
      S.plan = data.plans?.[0]?.data || null;
      if (S.trip.mode === "hytta") S.justDeparted = false;
      render();
      if (status === "ok" && !S.askedName) {
        S.askedName = true;
        if (!S.people[S.uid] && $("#sheet").hidden) openSettings(true);
        else if (S.offerPassword && $("#sheet").hidden) openSetPassword();
        cleanupExtras();
        checkLocation();
      }
    });
    await backend.start();
  }
}

// Fjern avhakede engangsting som er eldre enn tre dager.
function cleanupExtras() {
  const old = [...S.extras.values()].filter(x => x.done && x.doneAt && Date.now() - x.doneAt > 3 * 864e5);
  old.forEach(x => backend.extras.remove(x.id).catch(() => {}));
}

// ---------- Oppstart ----------
const initTab = location.hash.slice(1);
S.tab = TABS.includes(initTab) ? initTab : "liste";

if (!backend.configured) showAuth("nokey");
else {
  // Supabase anbefaler å ikke kalle andre Supabase-metoder direkte i auth-tilbakekallet.
  backend.onAuth(user => { setTimeout(() => enter(user), 0); });
  backend.getUser().then(enter);
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
