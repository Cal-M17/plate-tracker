import { $ } from './utils.js';

export async function queryAIParser(messageText, availableFoods) {
    try {
        const response = await fetch('/api/parse-food', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageText, availableFoods })
        });
        if (!response.ok) throw new Error('AI gateway error');
        return await response.json();
    } catch (err) {
        console.error(err);
        return null;
    }
}