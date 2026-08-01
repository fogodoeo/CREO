-- CREWARTS 설문 응답은 CREO 서버(service_role)만 읽고 씁니다.
-- 기존 config 테이블의 공개 정책은 CDCUP 화면과 호환을 위해 유지하되,
-- 개인별 설문 행만 restrictive 정책으로 차단합니다.

alter table public.config enable row level security;

drop policy if exists config_hide_private_crewart_select on public.config;
create policy config_hide_private_crewart_select
on public.config
as restrictive
for select
to anon, authenticated
using (
    key <> 'crewart_survey_responses'
    and key not like 'crewart_survey_response_entry_%'
    and key not like 'crewart_participant_entry_%'
);

drop policy if exists config_hide_private_crewart_insert on public.config;
create policy config_hide_private_crewart_insert
on public.config
as restrictive
for insert
to anon, authenticated
with check (
    key <> 'crewart_survey_responses'
    and key not like 'crewart_survey_response_entry_%'
    and key not like 'crewart_participant_entry_%'
);

drop policy if exists config_hide_private_crewart_update on public.config;
create policy config_hide_private_crewart_update
on public.config
as restrictive
for update
to anon, authenticated
using (
    key <> 'crewart_survey_responses'
    and key not like 'crewart_survey_response_entry_%'
    and key not like 'crewart_participant_entry_%'
)
with check (
    key <> 'crewart_survey_responses'
    and key not like 'crewart_survey_response_entry_%'
    and key not like 'crewart_participant_entry_%'
);

drop policy if exists config_hide_private_crewart_delete on public.config;
create policy config_hide_private_crewart_delete
on public.config
as restrictive
for delete
to anon, authenticated
using (
    key <> 'crewart_survey_responses'
    and key not like 'crewart_survey_response_entry_%'
    and key not like 'crewart_participant_entry_%'
);

comment on policy config_hide_private_crewart_select on public.config is
    '개인별 CREWARTS 설문 행은 공개 anon/authenticated 요청에 반환하지 않는다.';
