-- ============================================================
-- 우리 학교 생물지도 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) 관찰 기록 테이블 -------------------------------------------------
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  student_name text not null,
  class_name text not null,          -- CONFIG.CLASSES 의 id 값 ("1" ~ "9")

  lat double precision not null,
  lng double precision not null,

  plant_name text not null,

  taxon_species text,                -- 종
  taxon_genus text,                  -- 속
  taxon_family text,                 -- 과
  taxon_order text,                  -- 목
  taxon_class text,                  -- 강
  taxon_phylum text,                 -- 문
  taxon_kingdom text,                -- 계

  habitat text,
  morphology text,
  characteristics text,
  behavior text,

  photo_path text,                   -- storage 버킷 안의 파일 경로

  status text not null default 'pending' check (status in ('pending', 'approved')),
  reviewed_at timestamptz,
  reviewed_by uuid
);

alter table public.observations enable row level security;

create index if not exists idx_observations_status on public.observations (status);
create index if not exists idx_observations_class on public.observations (class_name);

-- 학생(비로그인, anon): 새 기록은 항상 '대기중' 상태로만 등록 가능
drop policy if exists "students_can_insert_pending" on public.observations;
create policy "students_can_insert_pending"
  on public.observations for insert
  to anon
  with check (status = 'pending');

-- 모든 방문자(비로그인): 승인된 기록만 조회 가능
drop policy if exists "public_can_view_approved" on public.observations;
create policy "public_can_view_approved"
  on public.observations for select
  to anon
  using (status = 'approved');

-- 교사(로그인 계정): 모든 기록 조회 가능
drop policy if exists "teacher_can_select_all" on public.observations;
create policy "teacher_can_select_all"
  on public.observations for select
  to authenticated
  using (true);

-- 교사: 승인 처리(수정) 가능
drop policy if exists "teacher_can_update" on public.observations;
create policy "teacher_can_update"
  on public.observations for update
  to authenticated
  using (true)
  with check (true);

-- 교사: 삭제 가능
drop policy if exists "teacher_can_delete" on public.observations;
create policy "teacher_can_delete"
  on public.observations for delete
  to authenticated
  using (true);


-- 2) 사진 저장용 Storage 버킷 -----------------------------------------
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', true)
on conflict (id) do nothing;

-- 누구나 사진을 볼 수 있음 (지도 팝업에 표시하기 위해)
drop policy if exists "anyone_can_view_photos" on storage.objects;
create policy "anyone_can_view_photos"
  on storage.objects for select
  to public
  using (bucket_id = 'plant-photos');

-- 학생(비로그인)도 사진 업로드 가능
drop policy if exists "anon_can_upload_photos" on storage.objects;
create policy "anon_can_upload_photos"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'plant-photos');

-- 교사(로그인)는 사진 삭제 가능
drop policy if exists "teacher_can_delete_photos" on storage.objects;
create policy "teacher_can_delete_photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'plant-photos');


-- ============================================================
-- 3) 교사(관리자) 계정 만들기
-- 이 SQL로는 만들 수 없습니다. Supabase 대시보드에서:
--   Authentication > Users > Add user
--   이메일/비밀번호를 직접 입력해서 교사 계정을 만드세요.
--   (여러 명이면 여러 번 반복해서 계정을 여러 개 만들면 됩니다)
-- ============================================================
