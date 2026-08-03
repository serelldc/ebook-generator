// supabase-config.js
const SUPABASE_URL = "https://qufesvtwvoudcazozice.supabase.co";
// Publishable key (bagong pangalan ng Supabase para sa dating "anon key").
// Safe itong ilagay sa public na file - hindi ito ang secret key.
const SUPABASE_ANON_KEY = "sb_publishable_EVXOD3WFSqSLGD_aVSK3Tw_oL0gpe1p";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
