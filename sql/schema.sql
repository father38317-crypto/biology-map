-- ============================================================
-- 우리 학교 생물지도 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 이미 한번 실행한 프로젝트에 다시 실행해도 안전합니다 (변경된 부분만 반영됨).
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

-- 기존에 만들어둔 테이블에도 학년 컬럼을 추가 (이미 있으면 무시됨)
alter table public.observations
  add column if not exists grade text not null default '1';

alter table public.observations
  drop constraint if exists observations_grade_check;
alter table public.observations
  add constraint observations_grade_check check (grade in ('1', '2', '3'));

-- 작성자 구분: 'student'(기본) / 'teacher' (교사가 올린 자료는 지도와 관리자 화면에 "교사"로 표시)
alter table public.observations
  add column if not exists author_type text not null default 'student';

alter table public.observations
  drop constraint if exists observations_author_type_check;
alter table public.observations
  add constraint observations_author_type_check check (author_type in ('student', 'teacher'));

-- 교사가 내용(이름/학년/반/위치/설명 등)을 수정한 시각. 승인 처리만 한 경우에는 바뀌지 않음 (아래 트리거가 자동 기록)
alter table public.observations
  add column if not exists edited_at timestamptz;

create or replace function public.mark_observation_edited()
returns trigger
language plpgsql
as $$
begin
  if (
    new.student_name, new.grade, new.class_name, new.lat, new.lng, new.plant_name,
    new.taxon_species, new.taxon_genus, new.taxon_family, new.taxon_order,
    new.taxon_class, new.taxon_phylum, new.taxon_kingdom,
    new.habitat, new.morphology, new.characteristics, new.behavior
  ) is distinct from (
    old.student_name, old.grade, old.class_name, old.lat, old.lng, old.plant_name,
    old.taxon_species, old.taxon_genus, old.taxon_family, old.taxon_order,
    old.taxon_class, old.taxon_phylum, old.taxon_kingdom,
    old.habitat, old.morphology, old.characteristics, old.behavior
  ) then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_observation_edited on public.observations;
create trigger trg_mark_observation_edited
  before update on public.observations
  for each row execute function public.mark_observation_edited();

-- 학생용 "내 기록": 글을 올릴 때 기기에 저장해 둔 무작위 ID(추측 불가)를 가진 사람만 그 글의 승인 상태/수정 여부를 조회할 수 있음
-- (승인 전 글은 원래 비로그인 사용자에게 보이지 않으므로, RLS를 우회하는 함수로 제한된 정보만 돌려준다)
create or replace function public.get_my_observations(p_ids uuid[])
returns table (
  id uuid,
  student_name text,
  plant_name text,
  grade text,
  class_name text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  edited_at timestamptz,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.student_name, o.plant_name, o.grade, o.class_name,
         o.status, o.created_at, o.reviewed_at, o.edited_at, o.lat, o.lng
  from public.observations o
  where o.id = any (p_ids[1:50])
  order by o.created_at desc;
$$;

revoke all on function public.get_my_observations(uuid[]) from public;
grant execute on function public.get_my_observations(uuid[]) to anon, authenticated;

alter table public.observations enable row level security;

create index if not exists idx_observations_status on public.observations (status);
create index if not exists idx_observations_class on public.observations (class_name);
create index if not exists idx_observations_grade on public.observations (grade);


-- 2) 교사별 담당 학년 테이블 -------------------------------------------
-- 학생/방문자는 접근 불가. 오직 SQL Editor(관리자)에서만 이 표에 교사를 등록/수정합니다.
create table if not exists public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grade text not null,              -- '1' / '2' / '3' / 'ALL' (전체 학년 관리)
  created_at timestamptz not null default now()
);

alter table public.teachers enable row level security;

-- 로그인한 교사는 본인 담당 학년 정보만 읽을 수 있음 (관리자 화면에 표시용)
drop policy if exists "teacher_can_read_own_row" on public.teachers;
create policy "teacher_can_read_own_row"
  on public.teachers for select
  to authenticated
  using (user_id = auth.uid());

-- insert/update/delete 정책 없음 = 학생/교사 모두 이 표를 직접 수정 불가.
-- 담당 학년 등록/변경은 이 파일 맨 아래 4)번 SQL을 프로젝트 관리자가 SQL Editor에서 직접 실행해야 합니다.


-- 3) observations 접근 권한 (RLS) --------------------------------------

-- 새 기록 등록 규칙 (로그인 여부와 상관없이 적용되도록 anon이 아닌 public 대상으로 설정)
--  1) 누구나: '대기중(pending)' 상태로만 등록 가능
--  2) 작성자 구분 'teacher'는 teachers 테이블에 등록된 교사 계정으로 로그인했을 때만 가능 (학생의 위장 방지)
--  3) 교사가 본인 담당 학년(또는 전체 학년 담당)에 올리는 'teacher' 자료는 '승인됨(approved)'으로 바로 등록 가능
drop policy if exists "students_can_insert_pending" on public.observations;
drop policy if exists "insert_observations" on public.observations;
create policy "insert_observations"
  on public.observations for insert
  to public
  with check (
    (
      status = 'pending'
      and (
        author_type = 'student'
        or exists (select 1 from public.teachers t where t.user_id = auth.uid())
      )
    )
    or
    (
      status = 'approved'
      and author_type = 'teacher'
      and exists (
        select 1 from public.teachers t
        where t.user_id = auth.uid()
          and (t.grade = observations.grade or t.grade = 'ALL')
      )
    )
  );

-- 모든 방문자(비로그인): 승인된 기록만 조회 가능 (모든 학년)
drop policy if exists "public_can_view_approved" on public.observations;
create policy "public_can_view_approved"
  on public.observations for select
  to anon
  using (status = 'approved');

-- 교사(로그인 계정): 본인이 담당하는 학년의 기록만 조회 가능
-- ('teachers' 테이블에 등록된 담당 학년과 일치하거나, 담당 학년이 'ALL'인 경우 전체 학년 조회 가능)
drop policy if exists "teacher_can_select_all" on public.observations;
drop policy if exists "teacher_can_select_own_grade" on public.observations;
create policy "teacher_can_select_own_grade"
  on public.observations for select
  to authenticated
  using (
    exists (
      select 1 from public.teachers t
      where t.user_id = auth.uid()
        and (t.grade = observations.grade or t.grade = 'ALL')
    )
  );

-- 교사: 본인 담당 학년만 승인 처리(수정) 가능
drop policy if exists "teacher_can_update" on public.observations;
drop policy if exists "teacher_can_update_own_grade" on public.observations;
create policy "teacher_can_update_own_grade"
  on public.observations for update
  to authenticated
  using (
    exists (
      select 1 from public.teachers t
      where t.user_id = auth.uid()
        and (t.grade = observations.grade or t.grade = 'ALL')
    )
  )
  with check (
    exists (
      select 1 from public.teachers t
      where t.user_id = auth.uid()
        and (t.grade = observations.grade or t.grade = 'ALL')
    )
  );

-- 교사: 본인 담당 학년만 삭제 가능
drop policy if exists "teacher_can_delete" on public.observations;
drop policy if exists "teacher_can_delete_own_grade" on public.observations;
create policy "teacher_can_delete_own_grade"
  on public.observations for delete
  to authenticated
  using (
    exists (
      select 1 from public.teachers t
      where t.user_id = auth.uid()
        and (t.grade = observations.grade or t.grade = 'ALL')
    )
  );


-- 새로 만든 함수(get_my_observations)를 API가 바로 인식하도록 갱신
notify pgrst, 'reload schema';


-- 4) 사진 저장용 Storage 버킷 -----------------------------------------
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', true)
on conflict (id) do nothing;

-- 누구나 사진을 볼 수 있음 (지도 팝업에 표시하기 위해)
drop policy if exists "anyone_can_view_photos" on storage.objects;
create policy "anyone_can_view_photos"
  on storage.objects for select
  to public
  using (bucket_id = 'plant-photos');

-- 누구나(로그인 여부 상관없이) 사진 업로드 가능
-- (교사가 로그인된 상태로 학생 화면에서 사진을 올려도 막히지 않도록 anon이 아닌 public 대상으로 설정)
drop policy if exists "anon_can_upload_photos" on storage.objects;
create policy "anon_can_upload_photos"
  on storage.objects for insert
  to public
  with check (bucket_id = 'plant-photos');

-- 교사(로그인)는 사진 삭제 가능
drop policy if exists "teacher_can_delete_photos" on storage.objects;
create policy "teacher_can_delete_photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'plant-photos');


-- ============================================================
-- 5) 교사(관리자) 계정 만들기 + 담당 학년 등록
--
-- (1) Supabase 대시보드 > Authentication > Users > Add user
--     이메일/비밀번호를 입력해서 계정 생성 (또는 초대 메일 전송)
--
-- (2) 생성된 사용자 목록에서 방금 만든 계정의 "UID"를 복사
--
-- (3) 아래 SQL의 UID와 담당 학년을 바꿔서 실행 (담당 학년: '1' / '2' / '3' / 'ALL')
--     insert into public.teachers (user_id, grade)
--     values ('여기에_UID_붙여넣기', '1')
--     on conflict (user_id) do update set grade = excluded.grade;
-- ============================================================
