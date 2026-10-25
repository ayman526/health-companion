// Family profiles, vitals and check-ins: each screen only sees the selected person.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

const STUBS = `
  create role authenticated; create role anon; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`

const USER_A = '00000000-0000-0000-0000-00000000000a'
const USER_B = '00000000-0000-0000-0000-00000000000b'
const SELF_A = '10000000-0000-0000-0000-00000000000a'
const MOM_A = '10000000-0000-0000-0000-0000000000a2'
const SELF_B = '10000000-0000-0000-0000-00000000000b'

let db: PGlite

/** Runs as a signed-in user, optionally with a person selected (the x-profile-id header). */
async function as<T>(userId: string, profileId: string | null, fn: () => Promise<T>): Promise<T> {
  const headers = profileId ? JSON.stringify({ 'x-profile-id': profileId }) : ''
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);
                 select set_config('request.headers', '${headers}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.headers', '', false);`)
  }
}
const rows = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated, anon;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into health_profiles (id, owner_id) values ('${SELF_A}', '${USER_A}'), ('${SELF_B}', '${USER_B}');
  `)
}, 60_000)

describe('family profiles', () => {
  it('lets an account add a family member but only one "self"', async () => {
    await as(USER_A, null, () => db.exec(`insert into health_profiles (id, owner_id, relationship, display_name) values ('${MOM_A}', '${USER_A}', 'parent', 'Mom')`))
    await expect(as(USER_A, null, () => db.exec(`insert into health_profiles (owner_id) values ('${USER_A}')`))).rejects.toThrow()
    expect(await as(USER_A, null, () => rows('select id from health_profiles'))).toHaveLength(2)
  })

  it('every profile-owned rule also checks the selected person', async () => {
    const policies = await rows(`select tablename, qual, with_check from pg_policies
      where schemaname = 'public' and (qual like '%is_profile_owner(profile_id)%' or with_check like '%is_profile_owner(profile_id)%')`)
    expect(policies.length).toBeGreaterThan(20)
    for (const p of policies) {
      if (p.qual) expect(p.qual, String(p.tablename)).toContain('is_active_profile(profile_id)')
      if (p.with_check) expect(p.with_check, String(p.tablename)).toContain('is_active_profile(profile_id)')
    }
  })

  it('shows only the selected person\'s records and blocks writing to another person', async () => {
    await as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind, systolic, diastolic) values ('${SELF_A}', 'blood_pressure', 128, 82)`))
    await as(USER_A, MOM_A, () => db.exec(`insert into vital_readings (profile_id, kind, systolic, diastolic) values ('${MOM_A}', 'blood_pressure', 150, 95)`))

    expect(await as(USER_A, SELF_A, () => rows('select systolic from vital_readings'))).toEqual([{ systolic: 128 }])
    expect(await as(USER_A, MOM_A, () => rows('select systolic from vital_readings'))).toEqual([{ systolic: 150 }])
    // Writing Mom's reading while "self" is selected is refused.
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind, weight_kg) values ('${MOM_A}', 'weight', 70)`))).rejects.toThrow()
    // Another account never sees them, whatever it sends.
    expect(await as(USER_B, MOM_A, () => rows('select * from vital_readings'))).toHaveLength(0)
  })

  it('accepts heart rate, oxygen and temperature, and photo-read values', async () => {
    await as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind, pulse) values ('${SELF_A}', 'heart_rate', 64);
      insert into vital_readings (profile_id, kind, spo2, source) values ('${SELF_A}', 'oxygen', 97, 'photo');
      insert into vital_readings (profile_id, kind, temperature_c) values ('${SELF_A}', 'temperature', 38.2)`))
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind, spo2) values ('${SELF_A}', 'oxygen', 101)`))).rejects.toThrow()
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind) values ('${SELF_A}', 'temperature')`))).rejects.toThrow()
  })

  it('lets people read published cards but not write them, and counts usage anonymously', async () => {
    await db.exec(`insert into library_items (source_name, source_url, title_en, title_ar, summary_en, summary_ar, primary_tags)
      values ('NHS', 'https://www.nhs.uk/x', 'T', 'ع', 'S', 'م', '{condition:hypertension}'),
             ('NHS', 'https://www.nhs.uk/hidden', 'H', 'ع', 'S', 'م', '{}')`)
    await db.exec(`update library_items set status = 'hidden' where source_url like '%hidden'`)
    expect(await as(USER_A, SELF_A, () => rows('select title_en from library_items'))).toEqual([{ title_en: 'T' }])
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into library_items (source_name, source_url, title_en, title_ar, summary_en, summary_ar) values ('x','https://x','a','b','c','d')`))).rejects.toThrow()

    const item = (await rows(`select id from library_items where title_en = 'T'`))[0].id
    await as(USER_A, SELF_A, () => db.exec(`insert into library_feedback (profile_id, item_id, reaction) values ('${SELF_A}', '${item}', 'not_relevant')`))
    expect(await as(USER_A, MOM_A, () => rows('select * from library_feedback'))).toHaveLength(0)

    await as(USER_A, SELF_A, () => db.exec(`select track_event('card_shown'); select track_event('card_shown'); select track_event('made_up_event')`))
    expect(await rows(`select event, count from usage_daily`)).toEqual([{ event: 'card_shown', count: 2 }])
    await expect(as(USER_A, SELF_A, () => rows('select * from usage_daily'))).rejects.toThrow()
  })

  it('records a checkup as already done, with its date', async () => {
    await as(USER_A, SELF_A, () => db.exec(`insert into suggestion_decisions (profile_id, suggestion_key, decision, done_on) values ('${SELF_A}', 'screen_colorectal|none', 'done', '2024-03-01')`))
    expect(await as(USER_A, SELF_A, () => rows(`select decision, done_on::text from suggestion_decisions`))).toEqual([{ decision: 'done', done_on: '2024-03-01' }])
  })

  it('checks reading shapes and one check-in per day', async () => {
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind, systolic, diastolic) values ('${SELF_A}', 'blood_pressure', 80, 120)`))).rejects.toThrow()
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into vital_readings (profile_id, kind) values ('${SELF_A}', 'glucose')`))).rejects.toThrow()
    await as(USER_A, SELF_A, () => db.exec(`insert into daily_checkins (profile_id, day, mood) values ('${SELF_A}', '2026-10-25', 4)`))
    await expect(as(USER_A, SELF_A, () => db.exec(`insert into daily_checkins (profile_id, day, mood) values ('${SELF_A}', '2026-10-25', 2)`))).rejects.toThrow()
  })
})
