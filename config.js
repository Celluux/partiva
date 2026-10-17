// Configuração pública da instalação. O build injeta os valores por ambiente.
// Nunca coloque service_role ou secrets neste arquivo.
window.PARTIVA_CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
};
