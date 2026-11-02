// ==========================================
// PLATE TRACKER - MAIN APPLICATION LOGIC
// ==========================================

// Helper selectors & utilities
const $ = (sel) => document.querySelector(sel);
const r = (num, decimals = 1) => Number(num.toFixed(decimals));
const uid = () => '_' + Math.random().toString(36).substr(2, 9);

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

// Application Global State
let S = {
    cur: localStorage.getItem('plate_cur_profile') || 'default',
    foods: [],
    recipes: [],
    log: [],
    weights: [],
    pendingLog: null // Holds AI parsed food preview before user confirmation
};

let chatMessages = [
    { sender: 'ai', text: "Alright! Tell me what you've eaten today, and I'll track it down for you." }
];

let date = new Date().toISOString().split('T')[0];

// ==========================================
// DATA LOADING & AUTO-SEEDING
// ==========================================
async function loadCurrentProfileData() {
    try {
        const data = await fetchProfileData(S.cur);
        S.recipes = data.recipes || [];
        S.log = data.log || [];
        S.weights = data.weights || [];

        // Auto-seed UK starter foods if profile food database is empty
        if (!data.foods || data.foods.length === 0) {
            console.log("Seeding UK starter foods into Supabase...");
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
    } catch (err) {
        console.error("Error loading profile data:", err);
    }
}

function itemsList() {
    return S.foods;
}

// ==========================================
// AI PARSER CALL WRAPPER
// ==========================================
async function queryAIParser(message, availableFoods) {
    try {
        const res = await fetch('/api/parse-food', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, availableFoods })
        });
        if (!res.ok) throw new Error('AI Serverless endpoint error');
        return await res.json();
    } catch (err) {
        console.error("AI Parser fetch error:", err);
        return null;
    }
}

// ==========================================
// CHAT & CONFIRMATION WORKFLOW
// ==========================================
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

    // 1. Check if user is confirming a pending log
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

    // 2. Check if user is canceling a pending log
    if (S.pendingLog && (lowerText === 'no' || lowerText === 'cancel' || lowerText === 'n')) {
        chatMessages.push({ sender: 'ai', text: "No worries, scrapped that log. What did you actually have?" });
        S.pendingLog = null;
        render();
        if (box) box.scrollTop = box.scrollHeight;
        return;
    }

    // 3. Query AI parser for new message / food log / chat
    const aiRes = await queryAIParser(text, S.foods);
    
    if (!aiRes) {
        chatMessages.push({ sender: 'ai', text: "Blimey, my connection dropped. Try that again?" });
    } else if (aiRes.is_chat) {
        chatMessages.push({ sender: 'ai', text: aiRes.reply });
    } else if (!aiRes.items || !aiRes.items.length) {
        chatMessages.push({ sender: 'ai', text: "I couldn't quite figure out what food that was. Try being a bit more descriptive!" });
    } else {
        // Store in pending state to await user confirmation
        S.pendingLog = {
            meal: aiRes.meal || "Snacks",
            items: aiRes.items
        };

        const previewMsg = aiRes.reply || "Here's what I found:";
        chatMessages.push({ sender: 'ai', text: `${previewMsg}\n\n👉 Reply **'yes'** to confirm and log this, or **'no'** to cancel.` });
    }
    
    render();
    if (box) box.scrollTop = box.scrollHeight;
};

// ==========================================
// RENDER FUNCTION PLACEHOLDER
// ==========================================
function render() {
    // Renders UI elements (chat boxes, nutrition summaries, tab views)
    const chatBox = $("#chat-box");
    if (chatBox) {
        chatBox.innerHTML = chatMessages.map(m => `
            <div class="chat-msg ${m.sender}">
                <span class="bubble">${m.text.replace(/\n/g, '<br>')}</span>
            </div>
        `).join('');
    }
}

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
    loadCurrentProfileData();
});