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

export const GENE_FAVORITES_KEY   = 'chlamatlas_gene_favorites';
export const MUTANT_FAVORITES_KEY = 'chlamatlas_mutant_favorites';

export function loadFavorites(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function toggleFavorite(id, storageKey) {
  const favs = loadFavorites(storageKey);
  const k    = String(id);
  if (favs.has(k)) { favs.delete(k); } else { favs.add(k); }
  try { localStorage.setItem(storageKey, JSON.stringify([...favs])); } catch {}
  return favs.has(k);
}
