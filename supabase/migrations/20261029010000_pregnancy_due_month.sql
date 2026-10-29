-- Pregnancy due month: the month is enough to show tips for each month of the
-- pregnancy. Stored as the first day of the month, and only while pregnant.

alter table health_profiles add column due_month date;
alter table health_profiles add constraint due_month_first_day check (due_month is null or extract(day from due_month) = 1);
alter table health_profiles add constraint due_month_only_pregnant check (due_month is null or pregnancy_status = 'pregnant');
