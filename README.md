# 🌱 우리 학교 생물지도

중학교 1학년 과학 수업용 웹앱. 학생들이 학교 곳곳에서 발견한 생물(식물·동물·곤충 등)을 지도에 기록하고,
교사가 부적절한 게시물을 승인/삭제할 수 있습니다. Leaflet(OpenStreetMap) + Supabase(무료) +
Vercel(무료)로 동작하며 별도 서버나 빌드 과정이 필요 없습니다.

## 폴더 구조

```
index.html        학생용 지도 페이지
admin.html        교사용 관리자 페이지
css/style.css     스타일
js/config.js      ★ 설정 파일 (여기만 고치면 됨)
js/utils.js       공통 함수 (이미지 압축, HTML 이스케이프 등)
js/supabaseClient.js
js/map.js         지도 페이지 로직
js/admin.js       관리자 페이지 로직
js/backup.js      백업(CSV+사진 zip) 로직
sql/schema.sql    Supabase에 실행할 SQL (테이블, 권한, 저장소)
```

## 1단계. Supabase 프로젝트 만들기

1. https://supabase.com 에서 무료 계정으로 로그인 후 **New project** 생성 (리전은 Northeast Asia (Seoul) 권장).
2. 왼쪽 메뉴 **SQL Editor** 로 이동 → [`sql/schema.sql`](sql/schema.sql) 파일 내용을 전체 복사해서 붙여넣고 **Run** 실행.
   - `observations` 테이블, 접근 권한(RLS), `plant-photos` 저장소 버킷이 한 번에 만들어집니다.
3. 왼쪽 메뉴 **Authentication > Users** 에서 **Add user** 로 교사 로그인 계정을 만듭니다 (이메일 + 비밀번호). 필요하면 여러 명 추가하세요.
4. 왼쪽 메뉴 **Project Settings > API** 에서 두 값을 복사해둡니다.
   - `Project URL`
   - `anon public` 키 (공개되어도 안전한 키입니다. 실제 보안은 2번에서 설정한 권한이 담당합니다.)

## 2단계. 설정 파일 수정

[`js/config.js`](js/config.js) 파일을 열어 아래 값을 채우세요.

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` : 1단계 4번에서 복사한 값
- `SCHOOL_LAT`, `SCHOOL_LNG` : 우리 학교 좌표
  - 구글맵에서 학교 건물을 우클릭 → 맨 위에 뜨는 좌표(위도, 경도)를 복사
- `CLASSES` : 반 이름과 핀 색상 (기본값 1~9반, 필요하면 자유롭게 수정)
- `PHOTO_MAX_WIDTH`, `PHOTO_QUALITY` : 사진 압축 설정 (기본 1200px / 75% 품질)

## 3단계. 로컬에서 확인하기 (선택)

브라우저 보안 정책상 `index.html`을 파일로 그냥 열면 일부 기능이 막힐 수 있어, 간단한 로컬 서버로 띄우는 것을 권장합니다.

```bash
npx serve .
```

실행 후 안내되는 주소(예: http://localhost:3000)로 접속해서 확인하세요.

## 4단계. Vercel에 배포하기

이 프로젝트는 순수 정적 사이트(HTML/CSS/JS)라 빌드 설정이 필요 없습니다.

**방법 A - Vercel CLI (가장 간단)**

```bash
npm install -g vercel
vercel
```

폴더 안에서 위 명령을 실행하고 안내에 따르면 됩니다. 이후 배포를 업데이트할 때는 `vercel --prod` 를 다시 실행하세요.

**방법 B - GitHub 연동**

1. 이 폴더를 GitHub 저장소로 push
2. https://vercel.com 에서 **Add New > Project** → 방금 만든 저장소 선택 → Framework Preset은 **Other**로 두고 Deploy

## 사용 방법

### 학생 (index.html)

1. 지도에서 발견한 위치를 클릭하거나, "📍 내 위치로 기록" 버튼으로 GPS 현재 위치를 사용
2. 이름/반, 생물 이름, 분류(종·속·과·목·강·문·계), 서식지, 형태, 특징, 습성, 사진을 입력 후 등록
3. 등록한 내용은 **교사가 승인하기 전까지 다른 사람에게는 보이지 않습니다** (제출한 학생 화면에는 "승인 대기중"으로 바로 보임)
4. 반별 색상 체크박스로 원하는 반만 지도에 표시할 수 있음

### 교사 (admin.html)

1. Supabase에서 만든 이메일/비밀번호로 로그인
2. 대기중인 게시물을 확인 후 **승인** 또는 **삭제**
3. 이미 승인된 게시물도 부적절하면 **삭제** 가능
4. 학기 말 **📦 전체 백업** 버튼 클릭 → 전체 데이터(CSV)와 사진이 담긴 zip 파일이 자동으로 다운로드됨

## 무료 요금제 관련 참고사항

- Supabase 무료 요금제: DB 500MB, Storage 1GB, 월 2GB 대역폭 등 한도가 있습니다. 사진은 클라이언트에서 자동 압축(1200px, 70~80% 품질)되어 올라가므로 300명 규모 수업이라면 충분히 여유가 있습니다.
- Supabase 무료 프로젝트는 **1주일 이상 접속이 없으면 일시 정지**될 수 있습니다. 정지되어도 대시보드에서 다시 활성화하면 데이터는 그대로 유지됩니다.
- Vercel 무료 요금제는 개인/비영리 용도의 정적 사이트에 충분합니다.

## 보안 설계 메모

- 이 앱은 별도 서버 없이 브라우저에서 Supabase에 직접 접속합니다. `anon key`는 공개되는 것이 정상이며, 실제 권한 제어는 `sql/schema.sql`의 **Row Level Security 정책**이 담당합니다.
  - 학생(비로그인)은 새 기록을 `pending` 상태로만 등록 가능, `approved` 상태만 조회 가능
  - 교사(로그인)만 전체 조회/승인/삭제 가능
- 사용자가 입력한 텍스트는 지도 팝업/관리자 화면에 표시되기 전에 이스케이프 처리되어 스크립트 삽입(XSS)을 방지합니다.
