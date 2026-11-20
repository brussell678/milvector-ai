-- Retirement Invitation Builder: run the guest-data purge every day.
--
-- purge_expired_invite_guests() (0032, extended in 0034) deletes guest answers
-- and messages 180 days after the ceremony. Until now it ran only when someone
-- answered an invitation or a host opened their guest list, so data could
-- outlive the promise on the Privacy page if neither happened. This schedules
-- it daily inside the database, with Supabase's pg_cron. Nothing else changes.
--
-- Safe to run more than once: scheduling a job with an existing name updates it.
-- Check it after running:
--   select jobname, schedule, active from cron.job where jobname = 'purge-expired-invite-guests';
-- And after its first run (03:17 UTC):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'purge-expired-invite-guests')
--   order by start_time desc limit 5;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'purge-expired-invite-guests',
  '17 3 * * *',
  $$select public.purge_expired_invite_guests()$$
);
