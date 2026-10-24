// Account deletion: removing the sign-in account must remove every health record.
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
const PROFILE_A = '10000000-0000-0000-0000-00000000000a'
const PROFILE_B = '10000000-0000-0000-0000-00000000000b'

let db: PGlite

const seed = (user: string, profile: string) => `
  insert into auth.users values ('${user}');
  insert into health_profiles (id, owner_id, time_zone) values ('${profile}', '${user}', 'Africa/Cairo');
  insert into user_consents (user_id, consent_type, version, granted) values ('${user}', 'terms', 'v1', true);
  insert into laboratory_reports (profile_id, collected_at, status, source) values ('${profile}', '2026-01-01', 'confirmed', 'user_entered');
  insert into medical_conditions (profile_id, name, status, source) values ('${profile}', 'Diabetes', 'confirmed', 'user_entered');
  insert into allergies (profile_id, substance, status, source) values ('${profile}', 'Penicillin', 'confirmed', 'user_entered');
  insert into medications (profile_id, brand_name, status, source) values ('${profile}', 'Metformin', 'confirmed', 'user_entered');
`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(seed(USER_A, PROFILE_A) + seed(USER_B, PROFILE_B))
  await db.exec(`update medical_conditions set name = 'Type 2 diabetes' where profile_id = '${PROFILE_A}'`)
}, 60_000)

const count = async (sql: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n)

describe('account deletion', () => {
  it('still audits ordinary deletes', async () => {
    await db.exec(`delete from allergies where profile_id = '${PROFILE_B}'`)
    expect(await count(`audit_events where profile_id = '${PROFILE_B}' and table_name = 'allergies' and action = 'delete'`)).toBe(1)
  })

  it('removes all of the user\'s records, including their audit trail, and nobody else\'s', async () => {
    expect(await count(`audit_events where profile_id = '${PROFILE_A}'`)).toBeGreaterThan(0)
    await db.exec(`delete from auth.users where id = '${USER_A}'`)

    const tables = (await db.query<{ table_name: string }>(`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'profile_id'`)).rows.map((r) => r.table_name)
    for (const t of tables) expect(await count(`${t} where profile_id = '${PROFILE_A}'`), t).toBe(0)
    expect(await count(`health_profiles where owner_id = '${USER_A}'`)).toBe(0)
    expect(await count(`user_consents where user_id = '${USER_A}'`)).toBe(0)

    expect(await count(`medications where profile_id = '${PROFILE_B}'`)).toBe(1)
    expect(await count(`user_consents where user_id = '${USER_B}'`)).toBe(1)
  })
})
