export const $ = s => document.querySelector(s);
export const r = n => Math.round(n);
export const r1 = n => Math.round(n * 10) / 10;
export const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const getTodayDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);