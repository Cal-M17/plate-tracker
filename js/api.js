import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Replace with your Supabase credentials
const SUPABASE_URL = 'https://ptzbpwpbbrcpoomfsxdb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-_LPGAK6PkjhUzxMtsu3zA_2jYKB-sn';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function fetchAllProfiles() {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) console.error(error);
    return data || [];
}

export async function fetchProfileData(profileId) {
    const [foods, recipes, logs, weights] = await Promise.all([
        supabase.from('foods').select('*').eq('profile_id', profileId),
        supabase.from('recipes').select('*').eq('profile_id', profileId),
        supabase.from('logs').select('*').eq('profile_id', profileId),
        supabase.from('weights').select('*').eq('profile_id', profileId)
    ]);
    return {
        foods: foods.data || [],
        recipes: recipes.data || [],
        log: logs.data || [],
        weights: weights.data || []
    };
}

export async function dbSaveFood(food, profileId) {
    const payload = { ...food, profile_id: profileId };
    const { data, error } = await supabase.from('foods').upsert(payload).select().single();
    if (error) console.error(error);
    return data;
}

export async function dbDeleteFood(id) {
    await supabase.from('foods').delete().eq('id', id);
}

export async function dbSaveRecipe(recipe, profileId) {
    const payload = { ...recipe, profile_id: profileId };
    const { data, error } = await supabase.from('recipes').upsert(payload).select().single();
    if (error) console.error(error);
    return data;
}

export async function dbDeleteRecipe(id) {
    await supabase.from('recipes').delete().eq('id', id);
}

export async function dbAddLog(logItem, profileId) {
    const payload = { ...logItem, profile_id: profileId };
    const { data, error } = await supabase.from('logs').insert(payload).select().single();
    if (error) console.error(error);
    return data;
}

export async function dbDeleteLog(id) {
    await supabase.from('logs').delete().eq('id', id);
}

export async function dbSaveWeight(weightItem, profileId) {
    const payload = { ...weightItem, profile_id: profileId };
    const { data, error } = await supabase.from('weights').upsert(payload, { onConflict: 'profile_id,date' }).select().single();
    if (error) console.error(error);
    return data;
}

export async function dbDeleteWeight(id) {
    await supabase.from('weights').delete().eq('id', id);
}