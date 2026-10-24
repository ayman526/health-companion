-- A photo of the user's own medicine box or pills, to recognize it at a glance.
-- Stored in the private medical-documents bucket under {profile_id}/medications/,
-- so the existing owner-only storage policies apply.
alter table medications add column photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/medications/[^/]+\.jpg$');
