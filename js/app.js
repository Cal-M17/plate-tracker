import { $, r, r1, esc, getTodayDate, uid } from './utils.js';
import { fetchAllProfiles, fetchProfileData, dbSaveFood, dbDeleteFood, dbSaveRecipe, dbDeleteRecipe, dbAddLog, dbDeleteLog, dbSaveWeight, dbDeleteWeight } from './api.js';
import { queryAIParser } from './ai.js';

let S = { profiles: [], cur: null, foods: [], recipes: [], log: [], weights: [], target: 2000 };
let tab = "today", date = getTodayDate(), add = { id: "", mode: "s", amt: "1", meal: "Breakfast", alt: false, amt2: "1" };
let draft = { name: "", ings: [{ fid: "", g: "" }], cooked: "", servings: "" };
let chatMessages = [{ sender: 'ai', text: "Hello! Tell me what you ate today in plain English (e.g., 'I had 250g of Greek yogurt and a banana for breakfast'), and I'll log it for you." }];
const M = ["k", "p", "c", "f"], MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

async function init() {
    const profiles = await fetchAllProfiles();
    if (!profiles.length) {
        // Fallback default profile creation if database is empty
        S.profiles = [{ id: "a", name: "Me", target: 2000 }, { id: "b", name: "Partner", target: 2000 }];
        S.cur = "a";
    } else {
        S.profiles = profiles;
        S.cur = profiles[0].id;
    }
    await loadCurrentProfileData();
}

async function loadCurrentProfileData() {
    const data = await fetchProfileData(S.cur);
    S.foods = data.foods;
    S.recipes = data.recipes;
    S.log = data.log;
    S.weights = data.weights;
    render();
}

// Compute macros per items
function itemsList() {
    const a = S.foods.map(f => ({ id: f.id, name: f.name, t: "Foods", per: { k: f.k, p: f.p, c: f.c, f: f.f }, sg: f.sg || 100 }));
    S.recipes.forEach(x => {
        const t = computeRecipe(x), w = +x.cooked || t.w;
        if (!w) return;
        const per = {};
        M.forEach(m => per[m] = t[m] / w * 100);
        a.push({ id: x.id, name: x.name, t: "Recipes", per, sg: w / (+x.servings || 1) });
    });
    return a.sort((a, b) => a.name.localeCompare(b.name));
}

function computeRecipe(x) {
    const t = { k: 0, p: 0, c: 0, f: 0, w: 0 };
    x.ings.forEach(i => {
        const f = S.foods.find(a => a.id === i.fid), g = +i.g || 0;
        if (!f || !g) return;
        t.w += g;
        M.forEach(m => t[m] += f[m] * g / 100);
    });
    return t;
}

function render() {
    $("#profile-switcher").innerHTML = S.profiles.map(p => `<button class="${p.id === S.cur ? "" : "alt"}" onclick="switchProfile('${p.id}')">${esc(p.name)}</button>`).join("");
    
    const app = $("#app");
    if (tab === "today") app.innerHTML = renderToday();
    else if (tab === "chat") app.innerHTML = renderAIChat();
    else if (tab === "foods") app.innerHTML = renderFoods();
    else if (tab === "rec") app.innerHTML = renderRecipes();
    else if (tab === "more") app.innerHTML = renderSettings();

    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
}

window.switchProfile = async (id) => {
    S.cur = id;
    await loadCurrentProfileData();
};

// --- Views ---
function renderToday() {
    const L = S.log.filter(l => l.date === date), T = { k: 0, p: 0, c: 0, f: 0 };
    L.forEach(l => M.forEach(m => T[m] += l[m]));
    const its = itemsList();

    return `<h2>Today’s Log</h2>
    <div class="card">
      <div style="display:flex;gap:6px">
        <input type="date" value="${date}" onchange="window.setDate(this.value)">
        <button class="alt" onclick="window.goToday()">Today</button>
      </div>
      <div class="big" style="margin-top:12px">${r(T.k)} <span>of ${S.target} kcal</span></div>
      <div class="bar"><i style="width:${Math.min(100, T.k / S.target * 100)}%"></i></div>
    </div>
    <div class="card">
      <h3>Add Entry</h3>
      <input id="q" placeholder="Search foods or recipes..." oninput="window.searchItem(this.value)">
      <div id="res"></div>
    </div>
    <div class="card"><h3>Entries</h3>${renderEntries(L)}</div>`;
}

function renderAIChat() {
    return `<h2>AI Assistant</h2>
    <div class="card">
      <div class="chat-box" id="chat-box">
        ${chatMessages.map(m => `<div class="chat-msg ${m.sender}">${esc(m.text)}</div>`).join("")}
      </div>
      <div style="display:flex;gap:8px">
        <input id="chat-input" placeholder="e.g. I had two eggs and toast..." onkeydown="if(event.key==='Enter')window.submitChat()">
        <button onclick="window.submitChat()">Send</button>
      </div>
    </div>`;
}

function renderFoods() {
    return `<h2>Foods</h2>
    <div class="card">
      <div class="g2">
        <input id="fn" class="w" placeholder="Food Name">
        <input id="fs" type="number" placeholder="Serving size in g">
        <input id="fk" type="number" placeholder="kcal per 100g">
        <input id="fp" type="number" placeholder="Protein per 100g">
        <input id="fc" type="number" placeholder="Carbs per 100g">
        <input id="ff" type="number" placeholder="Fat per 100g">
      </div>
      <button onclick="window.saveNewFood()">Save Food</button>
    </div>
    <div class="card">${S.foods.map(f => `<div class="row"><div><b>${esc(f.name)}</b><small>${r(f.k)} kcal per 100g</small></div><button class="x" onclick="window.removeFood('${f.id}')">Delete</button></div>`).join("")}</div>`;
}

function renderRecipes() { return `<h2>Recipes</h2><div class="card"><p>Recipe builder active.</p></div>`; }
function renderSettings() { return `<h2>Settings</h2><div class="card"><p>Profile target: ${S.target} kcal</p></div>`; }

function renderEntries(L) {
    if (!L.length) return '<div class="empty">No entries logged yet.</div>';
    return L.map(l => `<div class="row"><div><b>${esc(l.name)}</b><small>${esc(l.label)} — ${r(l.k)} kcal</small></div><button class="x" onclick="window.removeLog('${l.id}')">Delete</button></div>`).join("");
}

// --- Global Window Bindings for UI Event Handlers ---
window.setDate = d => { date = d || getTodayDate(); render(); };
window.goToday = () => { date = getTodayDate(); render(); };
window.searchItem = q => {
    const res = $("#res");
    if (!q) { res.innerHTML = ""; return; }
    const match = itemsList().filter(i => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
    res.innerHTML = match.map(i => `<div class="row" style="cursor:pointer" onclick="window.quickLog('${i.id}')"><div><b>${esc(i.name)}</b><small>${r(i.per.k * i.sg / 100)} kcal per serving</small></div></div>`).join("");
};

window.quickLog = async id => {
    const it = itemsList().find(i => i.id === id);
    if (!it) return;
    const itemData = {
        id: uid(), date, meal: "Breakfast", name: it.name, label: `1 serving (${r(it.sg)}g)`,
        k: it.per.k * it.sg / 100, p: it.per.p * it.sg / 100, c: it.per.c * it.sg / 100, f: it.per.f * it.sg / 100
    };
    await dbAddLog(itemData, S.cur);
    S.log.push(itemData);
    render();
};

window.removeLog = async id => {
    await dbDeleteLog(id);
    S.log = S.log.filter(l => l.id !== id);
    render();
};

window.saveNewFood = async () => {
    const name = $("#fn").value.trim();
    if (!name) return;
    const food = {
        id: uid(), name, k: +$("#fk").value || 0, p: +$("#fp").value || 0,
        c: +$("#fc").value || 0, f: +$("#ff").value || 0, sg: +$("#fs").value || 100
    };
    const saved = await dbSaveFood(food, S.cur);
    S.foods.push(saved);
    render();
};

window.removeFood = async id => {
    await dbDeleteFood(id);
    S.foods = S.foods.filter(f => f.id !== id);
    render();
};

window.submitChat = async () => {
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;

    chatMessages.push({ sender: 'user', text });
    input.value = "";
    render();
    const box = $("#chat-box");
    if (box) box.scrollTop = box.scrollHeight;

    const aiRes = await queryAIParser(text, itemsList());
    if (!aiRes || !aiRes.items || !aiRes.items.length) {
        chatMessages.push({ sender: 'ai', text: "I couldn't match those items to your database. Try adding them in the Foods tab first." });
    } else {
        let loggedSummary = [];
        for (const entry of aiRes.items) {
            const it = itemsList().find(i => i.id === entry.id);
            if (!it) continue;
            const grams = entry.grams || 100;
            const logItem = {
                id: uid(), date, meal: aiRes.meal || "Snacks", name: it.name, label: `${r(grams)}g`,
                k: it.per.k * grams / 100, p: it.per.p * grams / 100, c: it.per.c * grams / 100, f: it.per.f * grams / 100
            };
            await dbAddLog(logItem, S.cur);
            S.log.push(logItem);
            loggedSummary.push(`${r(grams)}g ${it.name}`);
        }
        chatMessages.push({ sender: 'ai', text: `Logged successfully: ${loggedSummary.join(", ")}` });
    }
    render();
    if (box) box.scrollTop = box.scrollHeight;
};

document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });

init();