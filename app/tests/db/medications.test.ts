// Phase 5 database logic: medications, regimen history, dose generation and reminders.
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

let db: PGlite

async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

async function save(med: object, schedule: object, from = daysAgo(3)) {
  return as(USER_A, async () =>
    (await db.query<{ id: string }>('select save_medication($1, $2, $3, $4) as id', [PROFILE_A, med, schedule, from])).rows[0].id)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated, anon;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into health_profiles (id, owner_id, time_zone) values ('${PROFILE_A}', '${USER_A}', 'Africa/Cairo');
    insert into health_profiles (owner_id) values ('${USER_B}');
  `)
}, 60_000)

describe('medications', () => {
  it('saves a medication with its schedule, a timeline event and upcoming doses', async () => {
    const id = await save(
      { brand_name: 'Fictostatin', strength: '20 mg' },
      { dose_amount: 1, dose_unit: 'tablet', frequency: 'daily', times_of_day: ['21:00'], time_zone: 'Africa/Cairo', reminders_enabled: true },
    )
    const doses = (await db.query<{ local: string }>(
      `select to_char(scheduled_for at time zone 'Africa/Cairo', 'HH24:MI') as local from medication_dose_logs l
       join medication_schedules s on s.id = l.schedule_id where s.medication_id = $1`, [id])).rows
    expect(doses.length).toBeGreaterThanOrEqual(2)
    expect(new Set(doses.map((d) => d.local))).toEqual(new Set(['21:00']))
    const ev = (await db.query<{ event_type: string }>(`select event_type from health_events where ref_id = $1`, [id])).rows
    expect(ev).toEqual([{ event_type: 'medication_started' }])
  })

  it('respects each schedule time zone', async () => {
    const id = await save(
      { brand_name: 'Travelmed' },
      { dose_amount: 1, frequency: 'daily', times_of_day: ['08:00'], time_zone: 'America/New_York' },
    )
    const local = (await db.query<{ local: string }>(
      `select distinct to_char(scheduled_for at time zone 'America/New_York', 'HH24:MI') as local from medication_dose_logs l
       join medication_schedules s on s.id = l.schedule_id where s.medication_id = $1`, [id])).rows
    expect(local).toEqual([{ local: '08:00' }])
  })

  it('weekly schedules only produce doses on the chosen weekdays', async () => {
    const id = await save(
      { brand_name: 'Weekly D' },
      { dose_amount: 1, frequency: 'weekly', days_of_week: [5], times_of_day: ['10:00'], time_zone: 'Africa/Cairo' },
      daysAgo(14),
    )
    const dows = (await db.query<{ dow: number }>(
      `select distinct extract(dow from scheduled_for at time zone 'Africa/Cairo')::int as dow from medication_dose_logs l
       join medication_schedules s on s.id = l.schedule_id where s.medication_id = $1`, [id])).rows
    for (const d of dows) expect(d.dow).toBe(5)
  })

  it('a dose change keeps the old regimen in history', async () => {
    const id = await save({ brand_name: 'Changemed' }, { dose_amount: 1, frequency: 'daily', times_of_day: ['09:00'], time_zone: 'Africa/Cairo' }, daysAgo(10))
    await as(USER_A, () => db.query('select change_regimen($1, $2, $3)', [id, { dose_amount: 2, frequency: 'daily', times_of_day: ['09:00'], time_zone: 'Africa/Cairo' }, today()]))
    const regs = (await db.query<{ dose_amount: string; valid_to: string | null }>(
      `select dose_amount, valid_to::text from medication_schedules where medication_id = $1 order by valid_from`, [id])).rows
    expect(regs.map((r) => [Number(r.dose_amount), r.valid_to == null])).toEqual([[1, false], [2, true]])
    expect(regs[0].valid_to).toBe(daysAgo(1))
  })

  it('stopping a medication ends the regimen and removes future unlogged doses', async () => {
    const id = await save({ brand_name: 'Stopmed' }, { dose_amount: 1, frequency: 'daily', times_of_day: ['23:59'], time_zone: 'Africa/Cairo' }, daysAgo(5))
    await as(USER_A, () => db.query('select stop_medication($1, $2)', [id, today()]))
    const med = (await db.query<{ is_active: boolean }>('select is_active from medications where id = $1', [id])).rows[0]
    expect(med.is_active).toBe(false)
    const future = (await db.query<{ n: number }>(
      `select count(*)::int as n from medication_dose_logs l join medication_schedules s on s.id = l.schedule_id
       where s.medication_id = $1 and l.scheduled_for >= (current_date + 1)::timestamp at time zone 'Africa/Cairo'`, [id])).rows[0]
    expect(future.n).toBe(0)
  })

  it('reminders need a confirmed schedule with dose and times', async () => {
    await expect(save({ brand_name: 'Nodose' }, { frequency: 'daily', times_of_day: ['09:00'], time_zone: 'Africa/Cairo', reminders_enabled: true }))
      .rejects.toThrow(/reminders_need_confirmed/)
  })

  it('logs doses for the owner only, and old unlogged doses become "not recorded"', async () => {
    const dose = (await db.query<{ id: string }>(`select id from medication_dose_logs where status = 'pending' order by scheduled_for limit 1`)).rows[0]
    await expect(as(USER_B, () => db.query('select log_dose($1, $2)', [dose.id, 'taken']))).rejects.toThrow(/dose not found/)
    await as(USER_A, () => db.query('select log_dose($1, $2)', [dose.id, 'taken']))
    expect((await db.query<{ status: string }>('select status from medication_dose_logs where id = $1', [dose.id])).rows[0].status).toBe('taken')

    await db.query(`update medication_dose_logs set scheduled_for = now() - interval '9 hours' where id = (select id from medication_dose_logs where status = 'pending' limit 1)`)
    const n = (await db.query<{ n: number }>('select mark_unrecorded_doses() as n')).rows[0].n
    expect(n).toBeGreaterThanOrEqual(1)
  })

  it('users cannot run the server jobs', async () => {
    await expect(as(USER_A, () => db.query('select mark_unrecorded_doses()'))).rejects.toThrow(/permission denied/)
    await expect(as(USER_A, () => db.query('select * from due_notifications(10)'))).rejects.toThrow(/permission denied/)
  })
})

describe('deleting a scanned prescription', () => {
  it('removes the document and its extraction but keeps medicines already added from it', async () => {
    const doc = (await db.query<{ id: string }>(
      `insert into medical_documents (profile_id, status, document_type, storage_path, mime_type, size_bytes, sha256)
       values ($1, 'needs_review', 'prescription', 'p/rx/original.jpg', 'image/jpeg', 100, 'rx-hash') returning id`, [PROFILE_A])).rows[0].id
    await db.query(`insert into document_extractions (profile_id, document_id, provider, model, prompt_version, structured) values ($1, $2, 'x', 'x', 'x', '{}')`, [PROFILE_A, doc])
    const med = await as(USER_A, async () => (await db.query<{ id: string }>(
      'select save_medication($1, $2, $3, $4, $5) as id',
      [PROFILE_A, { brand_name: 'Fictomox' }, { dose_amount: 1, frequency: 'daily', times_of_day: ['08:00'], time_zone: 'Africa/Cairo' }, today(), doc])).rows[0].id)

    await expect(as(USER_B, async () => (await db.query('delete from medical_documents where id = $1', [doc])).affectedRows)).resolves.toBe(0)
    await as(USER_A, () => db.query('delete from medical_documents where id = $1', [doc]))

    expect((await db.query('select 1 from medical_documents where id = $1', [doc])).rows).toEqual([])
    expect((await db.query('select 1 from document_extractions where document_id = $1', [doc])).rows).toEqual([])
    const kept = (await db.query<{ brand_name: string; document_id: string | null }>('select brand_name, document_id from medications where id = $1', [med])).rows[0]
    expect(kept).toEqual({ brand_name: 'Fictomox', document_id: null })
  })
})

describe('medicine photos', () => {
  it('only accepts a photo stored in the owner\'s own medications folder', async () => {
    const id = await save({ brand_name: 'Photomed' }, { dose_amount: 1, frequency: 'daily', times_of_day: ['08:00'], time_zone: 'Africa/Cairo' })
    await as(USER_A, () => db.query('update medications set photo_path = $1 where id = $2', [`${PROFILE_A}/medications/${id}-1.jpg`, id]))
    await expect(db.query('update medications set photo_path = $1 where id = $2', ['../other/file.jpg', id])).rejects.toThrow(/photo_path/)
  })
})

describe('life changes', () => {
  it('appear on the timeline, follow edits, and are private to their owner', async () => {
    const id = await as(USER_A, async () => (await db.query<{ id: string }>(
      `insert into lifestyle_events (profile_id, category, title, started_on) values ($1, 'exercise', 'Started running', '2026-06-03') returning id`, [PROFILE_A])).rows[0].id)
    const ev = async () => (await db.query<{ event_type: string; occurred_on: string; title: string }>(
      `select event_type, occurred_on::text, title from health_events where ref_id = $1`, [id])).rows
    expect(await ev()).toEqual([{ event_type: 'lifestyle', occurred_on: '2026-06-03', title: 'Started running' }])
    await as(USER_A, () => db.query(`update lifestyle_events set title = 'Running 3 times a week', started_on = '2026-06-05' where id = $1`, [id]))
    expect(await ev()).toEqual([{ event_type: 'lifestyle', occurred_on: '2026-06-05', title: 'Running 3 times a week' }])
    expect(await as(USER_B, async () => (await db.query('select * from lifestyle_events')).rows)).toEqual([])
    await as(USER_A, () => db.query('delete from lifestyle_events where id = $1', [id]))
    expect(await ev()).toEqual([])
  })

  it('rejects an end date before the start', async () => {
    await expect(db.query(`insert into lifestyle_events (profile_id, category, title, started_on, ended_on) values ($1, 'diet', 'Low sugar', '2026-06-03', '2026-06-01')`, [PROFILE_A]))
      .rejects.toThrow(/lifestyle_dates/)
  })

  it('records suggestion decisions once per suggestion', async () => {
    await as(USER_A, () => db.query(`insert into suggestion_decisions (profile_id, suggestion_key, decision) values ($1, 'statin_followup|ldl_c|2026-06-01', 'accepted')`, [PROFILE_A]))
    await expect(db.query(`insert into suggestion_decisions (profile_id, suggestion_key, decision) values ($1, 'statin_followup|ldl_c|2026-06-01', 'dismissed')`, [PROFILE_A]))
      .rejects.toThrow(/duplicate key/)
  })
})

describe('reminders', () => {
  it('repeating reminders move forward; one-off reminders complete', async () => {
    const mk = async (repeat: string) => (await db.query<{ id: string }>(
      `insert into reminders (profile_id, kind, status, title, due_at, time_zone, repeat_rule, next_fire_at)
       values ($1, 'lab_test', 'active', 'Repeat lipid test', '2026-11-01 08:00+02', 'Africa/Cairo', $2, '2026-11-01 08:00+02') returning id`,
      [PROFILE_A, repeat])).rows[0].id
    const once = await mk('none')
    const monthly = await mk('monthly')
    await as(USER_A, async () => {
      await db.query('select complete_reminder($1)', [once])
      await db.query('select complete_reminder($1)', [monthly])
    })
    const rows = (await db.query<{ id: string; status: string; due: string }>(
      `select id, status::text, to_char(due_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') as due from reminders where id in ($1, $2)`, [once, monthly])).rows
    expect(rows.find((r) => r.id === once)!.status).toBe('completed')
    expect(rows.find((r) => r.id === monthly)).toMatchObject({ status: 'active', due: '2026-12-01 08:00' })
  })
})

describe('dose follow-ups', () => {
  it('lists a dose once, 30+ minutes after its notification, only while still pending and with notifications on', async () => {
    await as(USER_A, () => db.query('select save_medication($1, $2, $3, $4)',
      [PROFILE_A, { brand_name: 'Followmox' }, { dose_amount: 1, frequency: 'daily', times_of_day: ['08:00'], time_zone: 'Africa/Cairo', reminders_enabled: true }, today()]))
    const dose = (await db.query<{ id: string }>(
      `insert into medication_dose_logs (profile_id, schedule_id, scheduled_for, status, notified_at)
       select $1, s.id, now() - interval '1 hour', 'pending', now() - interval '40 minutes'
       from medication_schedules s join medications m on m.id = s.medication_id
       where m.brand_name = 'Followmox' and s.valid_to is null
       returning id`, [PROFILE_A])).rows[0].id
    const due = async () => (await db.query<{ item_id: string }>('select item_id from due_followups(50)')).rows.map((r) => r.item_id)

    await db.query(`insert into notification_preferences (user_id, push_enabled) values ($1, false)
                    on conflict (user_id) do update set push_enabled = false`, [USER_A])
    expect(await due()).not.toContain(dose)

    await db.query('update notification_preferences set push_enabled = true where user_id = $1', [USER_A])
    expect(await due()).toContain(dose)

    await db.query('update notification_preferences set dose_followup = false where user_id = $1', [USER_A])
    expect(await due()).not.toContain(dose)
    await db.query('update notification_preferences set dose_followup = true where user_id = $1', [USER_A])

    await db.query(`update medication_dose_logs set followup_sent_at = now() where id = $1`, [dose])
    expect(await due()).not.toContain(dose)

    await db.query(`update medication_dose_logs set followup_sent_at = null, status = 'taken' where id = $1`, [dose])
    expect(await due()).not.toContain(dose)

    await expect(as(USER_A, () => db.query('select * from due_followups(10)'))).rejects.toThrow(/permission denied/)
  })
})

describe('team usage dashboard', () => {
  it('is only for team members and returns counts only', async () => {
    await db.exec(`alter table auth.users add column if not exists created_at timestamptz not null default now()`)
    await expect(as(USER_A, () => db.query('select usage_dashboard(30)'))).rejects.toThrow(/not allowed/)
    await expect(as(USER_A, () => db.query('select * from team_members'))).rejects.toThrow(/permission denied/)
    expect((await as(USER_A, () => db.query<{ t: boolean }>('select is_team_member() as t'))).rows[0].t).toBe(false)

    await db.query('insert into team_members (user_id) values ($1)', [USER_A])
    await db.query(`select track_event('advisor_asked')`)
    const d = (await as(USER_A, () => db.query<{ d: Record<string, unknown> }>('select usage_dashboard(30) as d'))).rows[0].d
    expect(d.started).toBeGreaterThanOrEqual(2)
    expect(d.signed_in).toBe(2)
    expect(d.first_record_any).toBeGreaterThanOrEqual(1) // user A has medicines from the tests above
    expect(d.events).toEqual(expect.arrayContaining([{ event: 'advisor_asked', total: 1 }]))
    expect(JSON.stringify(d)).not.toContain(USER_A)
    await db.query('delete from team_members')
  })
})
