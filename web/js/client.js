// Shared Supabase client and app state — imported by view modules to avoid circular deps with app.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js?v=62';
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
