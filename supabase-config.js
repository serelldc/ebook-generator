// supabase-config.js
// Hiwalay na Supabase project ito, gawa lang para sa ebook-generator -
// hindi ito ang parehong project ng lawfirm app, kaya hindi shared ang login.
const SUPABASE_URL = "https://bvklzienfqwyzcwnvusb.supabase.co";
// Publishable key (bagong pangalan ng Supabase para sa dating "anon key").
// Safe itong ilagay sa public na file - hindi ito ang secret key.
const SUPABASE_ANON_KEY = "sb_publishable_Ldp9KQGQBGCNvhU-M7yZgA_CRfwSR-i";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
