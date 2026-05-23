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

// Uses fetch() with the access token already in hand to avoid re-acquiring
// the Supabase auth storage lock inside onAuthStateChange (same pattern as refreshRole).
export async function syncFavoritesFromDB(accessToken) {
  if (!state.user || !accessToken) {
    state.favorites = { genes: new Set(), mutants: new Set() };
    return;
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/favorites?select=entity_type,entity_id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    if (res.ok) {
      const rows = await res.json();
      state.favorites.genes   = new Set(rows.filter(r => r.entity_type === 'gene').map(r => String(r.entity_id)));
      state.favorites.mutants = new Set(rows.filter(r => r.entity_type === 'mutant').map(r => String(r.entity_id)));
    }
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
