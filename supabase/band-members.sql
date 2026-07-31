-- Supabase SQL Editor에서 한 번 실행하세요.
-- 브라우저(anon/authenticated)는 이 명단을 직접 읽을 수 없고,
-- CREO 서버의 service-role 요청만 조회할 수 있습니다.

create table if not exists public.band_members (
    id bigint generated always as identity primary key,
    phone_normalized text not null unique
        check (phone_normalized ~ '^010[0-9]{8}$'),
    display_name text,
    band_member_key text,
    is_active boolean not null default true,
    joined_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists band_members_active_phone_idx
    on public.band_members (phone_normalized)
    where is_active = true;

alter table public.band_members enable row level security;
revoke all on table public.band_members from anon, authenticated;
grant all on table public.band_members to service_role;

comment on table public.band_members is
    '크레와트 BAND 가입 확인용 회원 명단. 전화번호는 숫자만 저장한다.';

-- 입력 예시 (실제 값으로 교체):
-- insert into public.band_members (phone_normalized, display_name, joined_at)
-- values ('01012345678', '홍길동', now())
-- on conflict (phone_normalized) do update
-- set display_name = excluded.display_name,
--     is_active = true,
--     joined_at = coalesce(public.band_members.joined_at, excluded.joined_at),
--     updated_at = now();
