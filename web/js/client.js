// ChlamAtlas — shared Supabase client and app state
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
  favorites:   { genes: new Set(), mutants: new Set() },
};

// ── Supabase-backed favorites ─────────────────────────────

export async function syncFavoritesFromDB() {
  if (!state.user) {
    state.favorites = { genes: new Set(), mutants: new Set() };
    return;
  }
  try {
    const { data, error } = await sb
      .from('favorites')
      .select('entity_type, entity_id');
    if (error) throw error;
    state.favorites.genes   = new Set((data ?? []).filter(r => r.entity_type === 'gene').map(r => String(r.entity_id)));
    state.favorites.mutants = new Set((data ?? []).filter(r => r.entity_type === 'mutant').map(r => String(r.entity_id)));
  } catch (e) {
    console.warn('[ChlamAtlas] syncFavoritesFromDB error:', e);
  }
}

// Returns true if now favorited, false if removed.
export async function toggleFavoriteDB(entityType, entityId) {
  if (!state.user) return false;
  const id     = String(entityId);
  const favSet = entityType === 'gene' ? state.favorites.genes : state.favorites.mutants;

  if (favSet.has(id)) {
    const { error } = await sb.from('favorites').delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);
    if (!error) favSet.delete(id);
    return false;
  } else {
    const { error } = await sb.from('favorites').insert({
      user_id:     state.user.id,
      entity_type: entityType,
      entity_id:   entityId,
    });
    if (!error) favSet.add(id);
    return true;
  }
}
