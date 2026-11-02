import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, availableFoods } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are an expert calorie and nutrition tracking AI assistant.
    Here is the user's available food database and recipes list: ${JSON.stringify(availableFoods)}
    The user states in natural language: "${message}"
    
    Task:
    1. Identify the meal category if mentioned (Breakfast, Lunch, Dinner, Snacks). Default to Snacks if ambiguous.
    2. Match items mentioned by the user to the closest items in the available database list.
    3. Estimate or extract the consumed quantity in grams for each item.
    
    Return ONLY a raw JSON response (no markdown syntax wrappers like \`\`\`json) with this exact structure:
    {
      "meal": "Breakfast" | "Lunch" | "Dinner" | "Snacks",
      "items": [
        { "id": "matched_food_id_from_database", "name": "Food Name", "grams": 150 }
      ]
    }`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const rawText = response.text.trim().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(rawText);
        return res.status(200).json(parsed);
    } catch (err) {
        console.error("Gemini AI Parsing Error:", err);
        return res.status(500).json({ error: 'Failed to process natural language log.' });
    }
}