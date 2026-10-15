// Supabase 클라이언트 초기화 (config.js, 그리고 CDN의 supabase-js 스크립트 다음에 로드되어야 함)
const supabaseClient = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

// 로그인 세션을 쓰지 않는 조회 전용 클라이언트 (교사가 로그인된 브라우저에서도 공개 지도를 똑같이 보여주기 위함)
const supabasePublic = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "public-readonly" } }
);
