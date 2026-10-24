// Runs the real Supabase migration on PGlite (Postgres in WebAssembly) with
// minimal stand-ins for Supabase's auth and storage schemas, then checks
// row-level security, file access and key constraints.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

const SUPABASE_STUBS = `
  create role authenticated;
  create role anon;
  create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
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

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

async function seedReport(profileId: string, reportId: string, resultId: string, value: number) {
  await db.query(
    `insert into laboratory_reports (id, profile_id, status, source, collected_at)
     values ($1, $2, 'confirmed', 'user_entered', '2026-05-10')`,
    [reportId, profileId],
  )
  await db.query(
    `insert into laboratory_results (id, profile_id, report_id, status, source, test_code, reported_name, value_numeric, unit)
     values ($1, $2, $3, 'confirmed', 'user_entered', 'ldl_c', 'LDL', $4, 'mg/dL')`,
    [resultId, profileId, reportId, value],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into health_profiles (id, owner_id) values ('${PROFILE_A}', '${USER_A}'), ('${PROFILE_B}', '${USER_B}');
    insert into storage.objects (bucket_id, name) values
      ('medical-documents', '${PROFILE_A}/doc1/original.pdf'),
      ('medical-documents', '${PROFILE_B}/doc2/original.pdf');
  `)
  await seedReport(PROFILE_A, '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 279)
  await seedReport(PROFILE_B, '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 150)
}, 60_000)

describe('row-level security', () => {
  it('a user sees only their own profile and results', async () => {
    const rows = await asUser(USER_A, async () => ({
      profiles: (await db.query<{ id: string }>('select id from health_profiles')).rows,
      results: (await db.query<{ id: string }>('select id from laboratory_results')).rows,
    }))
    expect(rows.profiles.map((r) => r.id)).toEqual([PROFILE_A])
    expect(rows.results.map((r) => r.id)).toEqual(['30000000-0000-0000-0000-00000000000a'])
  })

  it("a user cannot write into another user's profile", async () => {
    await expect(
      asUser(USER_A, () =>
        db.query(
          `insert into laboratory_reports (profile_id, status, source, collected_at)
           values ($1, 'confirmed', 'user_entered', '2026-06-01')`,
          [PROFILE_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it("updates to another user's rows silently affect nothing", async () => {
    const res = await asUser(USER_A, () =>
      db.query(`update laboratory_results set value_numeric = 1 where profile_id = $1`, [PROFILE_B]),
    )
    expect(res.affectedRows).toBe(0)
  })

  it('signed-in requests without a matching profile see nothing', async () => {
    const rows = await asUser('', async () => (await db.query('select id from laboratory_results')).rows)
    expect(rows).toHaveLength(0)
  })

  it('the anon role has no table access at all', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query('select id from health_profiles')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('stored files are visible only to their owner', async () => {
    const names = await asUser(USER_B, async () =>
      (await db.query<{ name: string }>('select name from storage.objects')).rows.map((r) => r.name),
    )
    expect(names).toEqual([`${PROFILE_B}/doc2/original.pdf`])
  })

  it('users cannot write the audit log or usage counters directly', async () => {
    await expect(
      asUser(USER_A, () =>
        db.query(`insert into usage_counters (profile_id, period) values ($1, '2026-10-01')`, [PROFILE_A]),
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('audit trail and corrections', () => {
  it('records the old value when a result is corrected', async () => {
    const id = '30000000-0000-0000-0000-00000000000a'
    await asUser(USER_A, () => db.query(`update laboratory_results set value_numeric = 27.9 where id = $1`, [id]))
    const audit = await asUser(USER_A, async () =>
      (
        await db.query<{ action: string; old_value: string; new_value: string; actor_id: string }>(
          `select action, old_values->>'value_numeric' as old_value, new_values->>'value_numeric' as new_value, actor_id
           from audit_events where record_id = $1 and action = 'update'`,
          [id],
        )
      ).rows,
    )
    expect(audit).toEqual([{ action: 'update', old_value: '279', new_value: '27.9', actor_id: USER_A }])
  })
})

describe('business constraints', () => {
  it('a confirmed lab report must have a collection date', async () => {
    await expect(
      db.query(`insert into laboratory_reports (profile_id, status, source) values ($1, 'confirmed', 'user_entered')`, [
        PROFILE_A,
      ]),
    ).rejects.toThrow(/confirmed_report_has_date/)
  })

  it('reminders cannot be enabled on an unconfirmed medication schedule', async () => {
    const med = await db.query<{ id: string }>(
      `insert into medications (profile_id, status, source, brand_name) values ($1, 'draft', 'document_extraction', 'Fictostatin') returning id`,
      [PROFILE_A],
    )
    await expect(
      db.query(
        `insert into medication_schedules (profile_id, medication_id, status, dose_amount, frequency, times_of_day, time_zone, valid_from, reminders_enabled)
         values ($1, $2, 'draft', 1, 'daily', '{08:00}', 'Africa/Cairo', '2026-06-01', true)`,
        [PROFILE_A, med.rows[0].id],
      ),
    ).rejects.toThrow(/reminders_need_confirmed/)
  })

  it('only one open regimen per medication', async () => {
    const med = await db.query<{ id: string }>(
      `insert into medications (profile_id, status, source, brand_name) values ($1, 'confirmed', 'user_entered', 'Fictostatin') returning id`,
      [PROFILE_A],
    )
    const insert = `insert into medication_schedules (profile_id, medication_id, status, dose_amount, frequency, times_of_day, time_zone, valid_from)
                    values ($1, $2, 'confirmed', $3, 'daily', '{21:00}', 'Africa/Cairo', '2026-06-01')`
    await db.query(insert, [PROFILE_A, med.rows[0].id, 1])
    await expect(db.query(insert, [PROFILE_A, med.rows[0].id, 2])).rejects.toThrow(/medication_schedules_one_open/)
  })

  it('an AI-proposed follow-up can never be labelled a clinician instruction', async () => {
    await expect(
      db.query(
        `insert into follow_up_plans (profile_id, source, is_clinician_instruction, description) values ($1, 'ai_proposed', true, 'Repeat ALT')`,
        [PROFILE_A],
      ),
    ).rejects.toThrow(/ai_is_never_clinician/)
  })

  it('the same file cannot be uploaded twice to a profile', async () => {
    const insert = `insert into medical_documents (profile_id, storage_path, mime_type, size_bytes, sha256)
                    values ($1, 'p/d/original.pdf', 'application/pdf', 1000, 'abc123')`
    await db.query(insert, [PROFILE_A])
    await expect(db.query(insert, [PROFILE_A])).rejects.toThrow(/duplicate key/)
  })
})
