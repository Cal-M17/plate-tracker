import { $, r, r1, esc, getTodayDate, uid } from './utils.js';
import { fetchAllProfiles, fetchProfileData, dbSaveFood, dbDeleteFood, dbSaveRecipe, dbDeleteRecipe, dbAddLog, dbDeleteLog, dbSaveWeight, dbDeleteWeight } from './api.js';
import { queryAIParser } from './ai.js';

// UK Starter Foods Dataset for Auto-Seeding
const UK_STARTER_FOODS = [
    { name: "Whole milk", k: 64, p: 3.4, c: 4.5, f: 3.9, sg: 200 },
    { name: "Semi-skimmed milk", k: 46, p: 3.5, c: 4.7, f: 1.7, sg: 200 },
    { name: "Skimmed milk", k: 34, p: 3.5, c: 4.8, f: 0.2, sg: 200 },
    { name: "Cheddar cheese", k: 416, p: 25.4, c: 0.1, f: 34.9, sg: 30 },
    { name: "Butter", k: 737, p: 0.5, c: 0, f: 81.7, sg: 10 },
    { name: "Natural yoghurt, low fat", k: 56, p: 5, c: 7, f: 0.8, sg: 150 },
    { name: "Egg, whole, raw", k: 143, p: 12.5, c: 0.1, f: 10.8, sg: 50 },
    { name: "Porridge oats", k: 375, p: 11, c: 60, f: 8.5, sg: 40 },
    { name: "White rice, raw", k: 355, p: 7, c: 79, f: 0.6, sg: 75 },
    { name: "Pasta, dried", k: 350, p: 12, c: 71, f: 1.8, sg: 75 },
    { name: "Potato, raw", k: 75, p: 2, c: 17.5, f: 0.2, sg: 150 },
    { name: "Banana, flesh only", k: 95, p: 1.2, c: 23, f: 0.3, sg: 120 },
    { name: "Apple, raw", k: 47, p: 0.4, c: 11.8, f: 0.1, sg: 150 },
    { name: "Chicken breast, raw", k: 106, p: 23, c: 0, f: 1.5, sg: 150 },
    { name: "Beef mince, 5% fat, raw", k: 130, p: 21, c: 0, f: 5, sg: 150 },
    { name: "Salmon, raw", k: 180, p: 20, c: 0, f: 11, sg: 150 },
    { name: "Tuna, canned in brine", k: 99, p: 23, c: 0, f: 0.6, sg: 120 },
    { name: "Olive oil", k: 899, p: 0, c: 0, f: 99.9, sg: 10 },
    { name: "Baked beans", k: 72, p: 4.7, c: 13, f: 0.3, sg: 200 },
    { name: "Red lentils, dried", k: 318, p: 23.8, c: 56, f: 1.3, sg: 75 },
    { name: "Chickpeas, canned", k: 115, p: 7.2, c: 16, f: 2.9, sg: 120 }
];

let S = { profiles: [], cur: null, foods: [], recipes: [], log: [], weights: [], target: 2000, pendingLog: null };
let tab = "today", date = getTodayDate(), add = { id: "", mode: "s", amt: "1", meal: "Breakfast", alt: false, amt2: "1" };
let draft = { name: "", ings: [{ fid: "", g: "" }], cooked: "", servings: "" };
let chatMessages = [{ sender: 'ai', text: "Alright! Tell me what you've eaten today, and I'll track it down for you." }];
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
    S.recipes = data.recipes || [];
    S.log = data.log || [];
    S.weights = data.weights || [];

    // Auto-seed UK starter foods if profile food database is empty
    if (!data.foods || data.foods.length === 0) {
        console.log("Seeding UK starter foods into Supabase...");
        data.foods = [];
        for (const f of UK_STARTER_FOODS) {
            const foodPayload = {
                id: uid(),
                name: f.name,
                k: f.k,
                p: f.p,
                c: f.c,
                f: f.f,
                sg: f.sg
            };
            const saved = await dbSaveFood(foodPayload, S.cur);
            if (saved) data.foods.push(saved);
        }
    }
    
    S.foods = data.foods || [];
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
    const profSwitcher = $("#profile-switcher");
    if (profSwitcher) {
        profSwitcher.innerHTML = S.profiles.map(p => `<button class="${p.id === S.cur ? "" : "alt"}" onclick="switchProfile('${p.id}')">${esc(p.name)}</button>`).join("");
    }
    
    const app = $("#app");
    if (app) {
        if (tab === "today") app.innerHTML = renderToday();
        else if (tab === "chat") app.innerHTML = renderAIChat();
        else if (tab === "foods") app.innerHTML = renderFoods();
        else if (tab === "rec") app.innerHTML = renderRecipes();
        else if (tab === "more") app.innerHTML = renderSettings();
    }

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
        ${chatMessages.map(m => `<div class="chat-msg ${m.sender}">${esc(m.text).replace(/\n/g, '<br>')}</div>`).join("")}
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
    if (saved) S.foods.push(saved);
    render();
};

window.removeFood = async id => {
    await dbDeleteFood(id);
    S.foods = S.foods.filter(f => f.id !== id);
    render();
};

// --- AI Chat Submission & Preview/Confirm Workflow ---
window.submitChat = async () => {
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;

    chatMessages.push({ sender: 'user', text });
    input.value = "";
    render();
    const box = $("#chat-box");
    if (box) box.scrollTop = box.scrollHeight;

    const lowerText = text.toLowerCase();

    // 1. Check if confirming a pending log
    if (S.pendingLog && (lowerText === 'yes' || lowerText === 'y' || lowerText === 'confirm' || lowerText.includes('do it') || lowerText.includes('please'))) {
        let loggedSummary = [];

        for (const entry of S.pendingLog.items) {
            let foodItem = null;

            if (entry.id) {
                foodItem = itemsList().find(i => i.id === entry.id);
            } else if (entry.newFoodData) {
                const newFoodPayload = {
                    id: uid(),
                    name: entry.newFoodData.name,
                    k: entry.newFoodData.k,
                    p: entry.newFoodData.p,
                    c: entry.newFoodData.c,
                    f: entry.newFoodData.f,
                    fi: entry.newFoodData.fi || null,
                    su: entry.newFoodData.su || null,
                    sa: entry.newFoodData.sa || null,
                    sl: entry.newFoodData.sl || null,
                    sg: entry.newFoodData.sg || 100
                };
                
                const savedFood = await dbSaveFood(newFoodPayload, S.cur);
                if (savedFood) {
                    S.foods.push(savedFood);
                    foodItem = {
                        id: savedFood.id,
                        name: savedFood.name,
                        per: { k: savedFood.k, p: savedFood.p, c: savedFood.c, f: savedFood.f }
                    };
                }
            }

            if (!foodItem) continue;

            const grams = entry.grams || 100;
            const logItem = {
                id: uid(),
                date,
                meal: S.pendingLog.meal,
                name: foodItem.name,
                label: `${r(grams)}g`,
                k: (foodItem.per?.k || foodItem.k) * grams / 100,
                p: (foodItem.per?.p || foodItem.p) * grams / 100,
                c: (foodItem.per?.c || foodItem.c) * grams / 100,
                f: (foodItem.per?.f || foodItem.f) * grams / 100
            };

            await dbAddLog(logItem, S.cur);
            S.log.push(logItem);
            loggedSummary.push(`${r(grams)}g ${foodItem.name}`);
        }

        chatMessages.push({ sender: 'ai', text: `Locked in! Successfully logged: ${loggedSummary.join(", ")}. Keep smashing it!` });
        S.pendingLog = null;
        render();
        if (box) box.scrollTop = box.scrollHeight;
        return;
    }

    // 2. Check if canceling a pending log
    if (S.pendingLog && (lowerText === 'no' || lowerText === 'cancel' || lowerText === 'n')) {
        chatMessages.push({ sender: 'ai', text: "No worries, scrapped that log. What did you actually have?" });
        S.pendingLog = null;
        render();
        if (box) box.scrollTop = box.scrollHeight;
        return;
    }

    // 3. Query AI parser for new query / log request
    const aiRes = await queryAIParser(text, itemsList());
    
    if (!aiRes) {
        chatMessages.push({ sender: 'ai', text: "Blimey, my connection dropped. Try that again?" });
    } else if (aiRes.is_chat) {
        chatMessages.push({ sender: 'ai', text: aiRes.reply });
    } else if (!aiRes.items || !aiRes.items.length) {
        chatMessages.push({ sender: 'ai', text: "I couldn't quite figure out what food that was. Try being a bit more descriptive!" });
    } else {
        S.pendingLog = {
            meal: aiRes.meal || "Snacks",
            items: aiRes.items
        };

        const previewMsg = aiRes.reply || "Here's what I found:";
        chatMessages.push({ sender: 'ai', text: `${previewMsg}\n\n👉 Reply 'yes' to confirm and log this, or 'no' to cancel.` });
    }
    
    render();
    if (box) box.scrollTop = box.scrollHeight;
};

document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });

// Initialize App
init();