// Supabase 클라이언트 초기화 (config.js, 그리고 CDN의 supabase-js 스크립트 다음에 로드되어야 함)
const supabaseClient = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);
