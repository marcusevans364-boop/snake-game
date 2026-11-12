window.RETRO_ARCADE_SUPABASE = window.RETRO_ARCADE_SUPABASE || {
  url: 'https://your-project-id.supabase.co',
  anonKey: 'your-anon-key',
  enabled: false
};

if (
  window.RETRO_ARCADE_SUPABASE.url &&
  window.RETRO_ARCADE_SUPABASE.url.indexOf('your-project-id') === -1 &&
  window.RETRO_ARCADE_SUPABASE.anonKey &&
  window.RETRO_ARCADE_SUPABASE.anonKey.indexOf('your-anon-key') === -1
) {
  window.RETRO_ARCADE_SUPABASE.enabled = true;
}
