// Phase 2 database functions: confirm/discard flow, quotas, function permissions.
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
const DOC = '40000000-0000-0000-0000-00000000000a'
const REPORT = '20000000-0000-0000-0000-00000000000a'
const R1 = '30000000-0000-0000-0000-000000000001'
const R2 = '30000000-0000-0000-0000-000000000002'

let db: PGlite

async function as<T>(role: 'authenticated' | 'anon', userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated, anon;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into health_profiles (id, owner_id) values ('${PROFILE_A}', '${USER_A}');
    insert into health_profiles (owner_id) values ('${USER_B}');
    insert into medical_documents (id, profile_id, status, storage_path, mime_type, size_bytes, sha256)
      values ('${DOC}', '${PROFILE_A}', 'needs_review', 'p/d/original.pdf', 'application/pdf', 1000, 'h1');
    insert into laboratory_reports (id, profile_id, document_id, status, source)
      values ('${REPORT}', '${PROFILE_A}', '${DOC}', 'draft', 'document_extraction');
    insert into laboratory_results (id, profile_id, report_id, document_id, status, source, reported_name, value_numeric, unit, needs_confirmation)
      values ('${R1}', '${PROFILE_A}', '${REPORT}', '${DOC}', 'draft', 'document_extraction', 'LDL', 2.79, 'mg/dL', '{value_numeric}'),
             ('${R2}', '${PROFILE_A}', '${REPORT}', '${DOC}', 'draft', 'document_extraction', 'Smudged row', 1, null, '{reported_name}');
  `)
}, 60_000)

const report = { lab_name: 'Fictional Lab', collected_at: '2026-05-10', reported_at: '2026-05-11' }

describe('confirm_lab_report', () => {
  it("another user cannot confirm someone else's report", async () => {
    await expect(
      as('authenticated', USER_B, () =>
        db.query('select confirm_lab_report($1, $2, $3)', [REPORT, report, JSON.stringify([{ id: R1, reported_name: 'LDL', value_numeric: 279 }])]),
      ),
    ).rejects.toThrow(/report not found/)
  })

  it('confirms corrected rows, discards removed rows, adds manual rows and a timeline event', async () => {
    const results = [
      { id: R1, test_code: 'ldl_c', reported_name: 'LDL Cholesterol', value_numeric: 279, unit: 'mg/dL', ref_high: 130 },
      { test_code: 'alt', reported_name: 'ALT', value_numeric: 23, unit: 'U/L', ref_high: 41 },
    ]
    await as('authenticated', USER_A, () => db.query('select confirm_lab_report($1, $2, $3)', [REPORT, report, JSON.stringify(results)]))

    const rows = (
      await db.query<{ id: string; status: string; value_numeric: string; source: string; needs_confirmation: string[] }>(
        'select id, status, value_numeric, source, needs_confirmation from laboratory_results where report_id = $1 order by reported_name',
        [REPORT],
      )
    ).rows
    expect(rows.map((r) => [r.status, r.source, Number(r.value_numeric)])).toEqual([
      ['confirmed', 'user_entered', 23],
      ['confirmed', 'document_extraction', 279],
      ['discarded', 'document_extraction', 1],
    ])
    expect(rows[1].needs_confirmation).toEqual([])

    const doc = (await db.query<{ status: string; document_date: string }>('select status, document_date::text from medical_documents where id = $1', [DOC])).rows[0]
    expect(doc).toEqual({ status: 'confirmed', document_date: '2026-05-10' })

    const events = (await db.query<{ event_type: string }>('select event_type from health_events where ref_id = $1', [REPORT])).rows
    expect(events).toEqual([{ event_type: 'lab_report' }])

    // The correction of 2.79 → 279 is in the audit log.
    const audit = (
      await db.query<{ old: string; new: string }>(
        `select old_values->>'value_numeric' as old, new_values->>'value_numeric' as new
         from audit_events where record_id = $1 and action = 'update'`,
        [R1],
      )
    ).rows
    expect(audit).toContainEqual({ old: '2.79', new: '279' })
  })

  it('cannot confirm twice', async () => {
    await expect(
      as('authenticated', USER_A, () => db.query('select confirm_lab_report($1, $2, $3)', [REPORT, report, JSON.stringify([{ id: R1, reported_name: 'LDL', value_numeric: 1 }])])),
    ).rejects.toThrow(/not a draft/)
  })

  it('requires a collection date', async () => {
    const r = (await db.query<{ id: string }>(`insert into laboratory_reports (profile_id, status, source) values ($1, 'draft', 'user_entered') returning id`, [PROFILE_A])).rows[0]
    await expect(
      as('authenticated', USER_A, () =>
        db.query('select confirm_lab_report($1, $2, $3)', [r.id, { lab_name: 'X' }, JSON.stringify([{ reported_name: 'HDL', value_numeric: 50 }])]),
      ),
    ).rejects.toThrow(/confirmed_report_has_date/)
  })
})

describe('learned test names', () => {
  it('confirming a manual match remembers it for that user only', async () => {
    const r = (await db.query<{ id: string }>(`insert into laboratory_reports (profile_id, status, source) values ($1, 'draft', 'user_entered') returning id`, [PROFILE_A])).rows[0]
    const rows = [{ reported_name: 'Lipid A', test_code: 'triglycerides', value_numeric: 50, unit: 'mg/dL', learn_alias: 'lipid a' }]
    await as('authenticated', USER_A, () => db.query('select confirm_lab_report($1, $2, $3)', [r.id, { collected_at: '2026-06-01' }, JSON.stringify(rows)]))

    const mine = await as('authenticated', USER_A, async () => (await db.query<{ alias_key: string; test_code: string }>('select alias_key, test_code from test_aliases')).rows)
    expect(mine).toEqual([{ alias_key: 'lipid a', test_code: 'triglycerides' }])
    const theirs = await as('authenticated', USER_B, async () => (await db.query('select * from test_aliases')).rows)
    expect(theirs).toEqual([])
  })
})

describe('unrecognized test names', () => {
  it('are counted without any link to the user, and users cannot read the list', async () => {
    const mk = async () => (await db.query<{ id: string }>(`insert into laboratory_reports (profile_id, status, source) values ($1, 'draft', 'user_entered') returning id`, [PROFILE_A])).rows[0].id
    const rows = [
      { reported_name: 'Lipoprotein (a)', value_numeric: 30, unit: 'mg/dL', name_key: 'lipoprotein a' },
      { reported_name: 'Ahmed 01012345678', value_numeric: 1, unit: 'x', name_key: 'ahmed 01012345678' },
    ]
    for (let i = 0; i < 2; i++) {
      const id = await mk()
      await as('authenticated', USER_A, () => db.query('select confirm_lab_report($1, $2, $3)', [id, { collected_at: '2026-07-01' }, JSON.stringify(rows)]))
    }
    const all = (await db.query<{ name_key: string; seen_count: number }>('select name_key, seen_count from unrecognized_test_names')).rows
    expect(all).toEqual([{ name_key: 'lipoprotein a', seen_count: 2 }])
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'unrecognized_test_names'`)).rows.map((r) => r.column_name)
    expect(cols.sort()).toEqual(['first_seen_at', 'last_seen_at', 'name_key', 'seen_count'])
    await expect(as('authenticated', USER_A, () => db.query('select * from unrecognized_test_names'))).rejects.toThrow(/permission denied/)
  })
})

describe('corrections', () => {
  it('corrects a confirmed result, keeps the old value in the audit log, and only for the owner', async () => {
    // R1 was confirmed above with value 279.
    await expect(as('authenticated', USER_B, () => db.query('select correct_lab_result($1, $2)', [R1, { value_numeric: 1 }]))).rejects.toThrow(/result not found/)
    await as('authenticated', USER_A, () => db.query('select correct_lab_result($1, $2)', [R1, { value_numeric: 27.9, unit: 'mg/dL' }]))
    const r = (await db.query<{ value_numeric: string; reported_name: string; status: string }>('select value_numeric, reported_name, status from laboratory_results where id = $1', [R1])).rows[0]
    expect([Number(r.value_numeric), r.reported_name, r.status]).toEqual([27.9, 'LDL Cholesterol', 'confirmed'])
    const audit = (await db.query<{ old: string; new: string }>(
      `select old_values->>'value_numeric' as old, new_values->>'value_numeric' as new from audit_events
       where record_id = $1 and action = 'update' and old_values->>'status' = 'confirmed'`, [R1])).rows
    expect(audit).toEqual([{ old: '279', new: '27.9' }])
  })

  it('can remove a confirmed result from the record (kept for audit)', async () => {
    await as('authenticated', USER_A, () => db.query('select correct_lab_result($1, $2)', [R1, { remove: true }]))
    const r = (await db.query<{ status: string }>('select status from laboratory_results where id = $1', [R1])).rows[0]
    expect(r.status).toBe('discarded')
    await expect(as('authenticated', USER_A, () => db.query('select correct_lab_result($1, $2)', [R1, { value_numeric: 5 }]))).rejects.toThrow(/only confirmed/)
  })

  it('corrects the report date and moves its timeline event', async () => {
    await as('authenticated', USER_A, () => db.query('select correct_lab_report($1, $2)', [REPORT, { collected_at: '2026-05-09', lab_name: 'Fictional Lab 2' }]))
    const ev = (await db.query<{ occurred_on: string; title: string }>(`select occurred_on::text, title from health_events where ref_id = $1`, [REPORT])).rows[0]
    expect(ev).toEqual({ occurred_on: '2026-05-09', title: 'Fictional Lab 2' })
  })
})

describe('quotas and function permissions', () => {
  it('consume_quota stops at the limit', async () => {
    const use = async () => (await db.query<{ ok: boolean }>(`select consume_quota($1, 'extractions', 2) as ok`, [PROFILE_A])).rows[0].ok
    expect([await use(), await use(), await use()]).toEqual([true, true, false])
  })

  it('users cannot call server-only functions', async () => {
    await expect(as('authenticated', USER_A, () => db.query(`select consume_quota($1, 'extractions', 999)`, [PROFILE_A]))).rejects.toThrow(/permission denied/)
    await expect(as('authenticated', USER_A, () => db.query(`select has_consent($1, 'ai_processing')`, [USER_B]))).rejects.toThrow(/permission denied/)
    await expect(as('anon', '', () => db.query(`select has_consent($1, 'ai_processing')`, [USER_B]))).rejects.toThrow(/permission denied/)
  })

  it('my_consent reports only the caller’s own latest consent', async () => {
    await db.query(`insert into user_consents (user_id, consent_type, version, granted) values ($1, 'ai_processing', 'v1', true)`, [USER_A])
    await db.query(`insert into user_consents (user_id, consent_type, version, granted, created_at) values ($1, 'ai_processing', 'v1', false, now() + interval '1 second')`, [USER_A])
    const a = await as('authenticated', USER_A, async () => (await db.query<{ c: boolean }>(`select my_consent('ai_processing') as c`)).rows[0].c)
    const b = await as('authenticated', USER_B, async () => (await db.query<{ c: boolean }>(`select my_consent('ai_processing') as c`)).rows[0].c)
    expect([a, b]).toEqual([false, false])
  })

  it('HEIC uploads are rejected', async () => {
    await expect(
      db.query(`insert into medical_documents (profile_id, storage_path, mime_type, size_bytes, sha256) values ($1, 'x', 'image/heic', 10, 'h2')`, [PROFILE_A]),
    ).rejects.toThrow(/mime_type_check/)
  })
})
