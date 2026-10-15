-- REVIEWED OPERATOR ACTION ONLY: the next cron tick permanently erases due rows.
-- First inspect aggregate due/invalid counts and approve the real-data impact.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $$
declare existing record;
begin
 if current_user<>'postgres' then raise exception 'Privileged operator required' using errcode='42501';end if;
 select * into existing from cron.job where jobname='manee-reservation-retention';
 if found then
  if existing.schedule<>'* * * * *' or existing.command<>'select private.manee_purge_expired_reservations(500);'
   or existing.username<>'postgres' or not existing.active then
   raise exception 'Existing retention schedule differs; review before changing it';
  end if;
 else
  perform cron.schedule('manee-reservation-retention','* * * * *',
   'select private.manee_purge_expired_reservations(500);');
 end if;
end $$;
commit;
