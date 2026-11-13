-- Three built-in tools replace the ChatGPT custom GPT links (retired by OpenAI
-- on 2026-12-11): Interview Strategist, VA Rating Navigator, SBP Decision Advisor.
--
-- Additive and safe to run against production: it only widens the list of
-- tool names tool_runs accepts. Until it is run, the three tools still work,
-- but their runs are not logged, so they do not show in Recent Activity and do
-- not count toward the daily AI usage limit.

alter table public.tool_runs
drop constraint if exists tool_runs_tool_name_check;

alter table public.tool_runs
add constraint tool_runs_tool_name_check
check (tool_name in (
  'fitrep_bullets',
  'mos_translator',
  'jd_decoder',
  'resume_targeter',
  'linkedin_builder',
  'interview_strategist',
  'va_rating_navigator',
  'sbp_advisor'
));
