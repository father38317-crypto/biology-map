// ============================================================
// 이 파일만 수정하면 앱을 우리 학교에 맞게 설정할 수 있습니다.
// ============================================================
const CONFIG = {
  // Supabase 프로젝트 설정 (Supabase 대시보드 > Project Settings > API 에서 확인)
  SUPABASE_URL: "https://otnpwvyqaaguesqhciil.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_S2Y5rxH_ETpZwGlhv_r00A_JVzYLSKw",

  // 사진을 저장할 Storage 버킷 이름 (sql/schema.sql 에서 만든 이름과 동일해야 함)
  PHOTO_BUCKET: "plant-photos",

  // 사진 압축 설정
  PHOTO_MAX_WIDTH: 1200, // px
  PHOTO_QUALITY: 0.75,   // 0.7 ~ 0.8 권장

  // 학교 위치 (지도 초기 중심 좌표) - 실제 학교 좌표로 반드시 변경하세요.
  // 구글맵에서 학교 건물을 우클릭하면 좌표가 나옵니다. (위도, 경도 순서)
  SCHOOL_LAT: 35.1775562,
  SCHOOL_LNG: 126.8844054,
  DEFAULT_ZOOM: 19,

  // 학년 목록 (학년마다 반 구성은 CLASSES를 공동으로 사용합니다)
  GRADES: [
    { id: "1", label: "1학년" },
    { id: "2", label: "2학년" },
    { id: "3", label: "3학년" },
  ],

  // 반 목록과 지도 핀 색상 (파스텔톤, 필요하면 개수/이름/색을 수정하세요)
  CLASSES: [
    { id: "1", label: "1반", color: "#F5A3A3" },
    { id: "2", label: "2반", color: "#A9D8A9" },
    { id: "3", label: "3반", color: "#A7C7EC" },
    { id: "4", label: "4반", color: "#F6C89F" },
    { id: "5", label: "5반", color: "#C9AEE4" },
    { id: "6", label: "6반", color: "#9ADCDC" },
    { id: "7", label: "7반", color: "#F0AED4" },
    { id: "8", label: "8반", color: "#D6B98C" },
    { id: "9", label: "9반", color: "#9FD4C9" },
  ],
};
