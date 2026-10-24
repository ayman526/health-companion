-- Optional profile details collected during onboarding (all skippable) and the
-- step the user reached, so onboarding resumes where they left off.

alter table health_profiles
  add column height_cm numeric check (height_cm is null or height_cm between 50 and 260),
  add column weight_kg numeric check (weight_kg is null or weight_kg between 20 and 400),
  add column pregnancy_status text check (pregnancy_status in ('pregnant', 'breastfeeding', 'neither', 'prefer_not_to_say')),
  add column smoking_status text check (smoking_status in ('never', 'former', 'current', 'prefer_not_to_say')),
  add column no_known_conditions boolean not null default false,
  add column no_known_allergies boolean not null default false,
  add column onboarding_step smallint not null default 0 check (onboarding_step between 0 and 20);
