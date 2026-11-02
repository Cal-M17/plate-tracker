import { GoogleGenAI } from '@google/genai';

async function searchOpenFoodFacts(query) {
    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_tag=categories&countries=United+Kingdom&json=true&page_size=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'PlateTrackerApp - UK Personal Calorie Tracker' } });
        const data = await res.json();
        
        if (data.products && data.products.length > 0) {
            const p = data.products[0];
            const nut = p.nutriments || {};
            
            return {
                name: p.product_name_en || p.product_name || query,
                k: nut['energy-kcal_100g'] || nut['energy-kcal_value'] || 0,
                p: nut['proteins_100g'] || 0,
                c: nut['carbohydrates_100g'] || 0,
                f: nut['fat_100g'] || 0,
                fi: nut['fiber_100g'] || null,
                su: nut['sugars_100g'] || null,
                sa: nut['saturated-fat_100g'] || null,
                sl: nut['salt_100g'] || null,
                sg: 100
            };
        }
    } catch (err) {
        console.error("Open Food Facts fetch error:", err);
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, availableFoods } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are a witty, supportive, no-nonsense British nutrition coach and calorie tracker assistant. You have plenty of personality—encouraging, sharp, and slightly cheeky when appropriate.
    
    User's existing database foods: ${JSON.stringify(availableFoods.map(f => ({ id: f.id, name: f.name })))}
    User statement: "${message}"

    Determine what the user wants:
    1. If it's a general greeting or casual chat: set "is_chat": true, provide a clever, personality-driven "reply", and leave items empty.
    2. If it's food logging: set "is_chat": false, determine the meal category (Breakfast, Lunch, Dinner, Snacks), extract food items and grams, match local database IDs or provide an Open Food Facts "search_query". Also provide a fun, characteristic conversational "reply" summarizing what you found and asking for confirmation.

    Return ONLY raw JSON with structure:
    {
      "is_chat": boolean,
      "reply": "Your witty/supportive response here",
      "meal": "Breakfast" | "Lunch" | "Dinner" | "Snacks",
      "items": [
        { "id": "matched_id_or_null", "search_query": "Food name to query", "grams": 150 }
      ]
    }`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const rawText = response.text.trim().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(rawText);

        if (parsed.is_chat) {
            return res.status(200).json({ is_chat: true, reply: parsed.reply });
        }

        const processedItems = [];
        for (const item of parsed.items) {
            if (item.id) {
                const localFood = availableFoods.find(f => f.id === item.id);
                processedItems.push({
                    id: item.id,
                    name: localFood ? localFood.name : "Food item",
                    per: localFood,
                    grams: item.grams
                });
            } else if (item.search_query) {
                const offResult = await searchOpenFoodFacts(item.search_query);
                if (offResult) {
                    processedItems.push({
                        id: null,
                        newFoodData: offResult,
                        name: offResult.name,
                        grams: item.grams
                    });
                }
            }
        }

        return res.status(200).json({ 
            is_chat: false, 
            reply: parsed.reply,
            meal: parsed.meal, 
            items: processedItems 
        });

    } catch (err) {
        console.error("AI Handler Error:", err);
        return res.status(500).json({ error: 'Failed to process message.' });
    }
}