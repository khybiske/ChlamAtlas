// Shared Supabase client and app state — imported by view modules to avoid circular deps with app.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js?v=65';
export { SUPABASE_URL, SUPABASE_ANON_KEY };

const { createClient } = window.supabase;

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = {
  user:        null,
  userRole:    'guest',
  userProfile: null,
  accessToken: null,
  currentTab:  'home',
};

export const FAVORITES_KEY = 'chlamatlas_favorites';

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function toggleFavorite(id) {
  const favs = loadFavorites();
  const key  = String(id);
  if (favs.has(key)) { favs.delete(key); } else { favs.add(key); }
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs])); } catch {}
  return favs.has(key);
}
