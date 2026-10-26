// Sharing between accounts: nothing is visible before approval, access levels
// are enforced by the database, owners stay in control, and hand-over moves a
// profile to its person's own account.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

const STUBS = `
  create role authenticated; create role anon; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`

const MOM = '00000000-0000-0000-0000-0000000000a1' // has her own account
const SON = '00000000-0000-0000-0000-0000000000b1' // helps her
const OTHER = '00000000-0000-0000-0000-0000000000c1'
const NEW_DAD = '00000000-0000-0000-0000-0000000000d1' // gets his own account later
const MOM_P = '10000000-0000-0000-0000-0000000000a1'
const SON_P = '10000000-0000-0000-0000-0000000000b1'
const OTHER_P = '10000000-0000-0000-0000-0000000000c1'
const DAD_KEPT_BY_SON = '10000000-0000-0000-0000-0000000000b2'

let db: PGlite

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
const q = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params).then((r) => r.rows)
const readings = (user: string, profile: string) => as(user, profile, () => q('select id from vital_readings'))
const addReading = (user: string, profile: string) =>
  as(user, profile, () => q(`insert into vital_readings (profile_id, kind, weight_kg) values ($1, 'weight', 70)`, [profile]))
const sharesOf = (user: string) => as(user, null, () => q('select my_shares() as s')).then((r) => r[0].s as Record<string, unknown>[])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of MIGRATIONS) await db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated, anon;
    insert into auth.users (id, email) values ('${MOM}', 'mom@example.com'), ('${SON}', 'son@example.com'),
      ('${OTHER}', 'other@example.com'), ('${NEW_DAD}', 'dad@example.com');
    insert into health_profiles (id, owner_id, display_name) values ('${MOM_P}', '${MOM}', 'Mona'), ('${SON_P}', '${SON}', 'Ayman'), ('${OTHER_P}', '${OTHER}', 'X');
    insert into health_profiles (id, owner_id, relationship, display_name) values ('${DAD_KEPT_BY_SON}', '${SON}', 'parent', 'Dad');
    insert into vital_readings (profile_id, kind, weight_kg) values ('${MOM_P}', 'weight', 65), ('${DAD_KEPT_BY_SON}', 'weight', 80);
  `)
}, 60_000)

describe('sharing with approval', () => {
  it('shows nothing before the owner approves a request', async () => {
    await as(SON, null, () => q(`select share_request('MOM@example.com')`))
    expect(await readings(SON, MOM_P)).toEqual([])
    const momSees = await sharesOf(MOM)
    expect(momSees).toEqual([expect.objectContaining({ kind: 'request', direction: 'received', grantee_email: 'son@example.com', grantee_name: 'Ayman' })])
    // Someone else can't approve it.
    await expect(as(OTHER, null, () => q('select share_respond($1, true)', [momSees[0].id]))).rejects.toThrow(/not allowed/)
  })

  it('view access: reads only, and only after approval', async () => {
    const req = (await sharesOf(MOM))[0]
    await as(MOM, null, () => q(`select share_respond($1, true, null, 'view', false)`, [req.id]))
    expect(await readings(SON, MOM_P)).toHaveLength(1)
    await expect(addReading(SON, MOM_P)).rejects.toThrow()
    expect(await as(SON, null, () => q('select id, display_name from health_profiles order by display_name'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: MOM_P, display_name: 'Mona' })]))
    // The helper can't change her profile.
    expect((await as(SON, null, () => db.query(`update health_profiles set display_name = 'x' where id = $1`, [MOM_P]))).affectedRows).toBe(0)
  })

  it('help access: can add records; changes show in the owner\'s activity', async () => {
    const share = (await sharesOf(MOM)).find((s) => s.status === 'active')!
    await as(MOM, null, () => q(`select share_update($1, 'help', true)`, [share.id]))
    await addReading(SON, MOM_P)
    expect(await readings(MOM, MOM_P)).toHaveLength(2)
    await as(SON, null, () => q('select log_shared_view($1)', [MOM_P]))
    const activity = (await as(MOM, null, () => q('select share_activity($1) as a', [MOM_P])))[0].a as { action: string; who: string }[]
    expect(activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'viewed', who: 'son@example.com' }),
      expect.objectContaining({ action: 'insert', who: 'son@example.com' }),
    ]))
    await expect(as(SON, null, () => q('select share_activity($1)', [MOM_P]))).rejects.toThrow(/not allowed/)
  })

  it('keeps advisor conversations private to the owner', async () => {
    await q(`insert into ai_conversations (profile_id) values ($1)`, [MOM_P])
    expect(await as(SON, MOM_P, () => q('select id from ai_conversations'))).toEqual([])
    expect(await as(MOM, MOM_P, () => q('select id from ai_conversations'))).toHaveLength(1)
  })

  it('stops immediately when the owner revokes', async () => {
    const share = (await sharesOf(MOM)).find((s) => s.status === 'active')!
    await as(MOM, null, () => q('select share_revoke($1)', [share.id]))
    expect(await readings(SON, MOM_P)).toEqual([])
    expect(await sharesOf(SON)).toEqual([])
  })

  it('invites by email and respects expiry', async () => {
    await as(MOM, null, () => q(`select share_invite($1, 'son@example.com', 'view', false, 30)`, [MOM_P]))
    await expect(as(OTHER, null, () => q(`select share_invite($1, 'x@example.com', 'view', false, 0)`, [MOM_P]))).rejects.toThrow(/not allowed/)
    const invite = (await sharesOf(SON)).find((s) => s.kind === 'invite')!
    expect(invite).toMatchObject({ direction: 'received', owner_email: 'mom@example.com', owner_name: 'Mona' })
    await as(SON, null, () => q('select share_respond($1, true)', [invite.id]))
    expect(await readings(SON, MOM_P)).toHaveLength(2)
    await q(`update profile_shares set expires_at = now() - interval '1 minute' where id = $1`, [invite.id])
    expect(await readings(SON, MOM_P)).toEqual([])
  })

  it('sends missed-dose alerts only to helpers who asked for them', async () => {
    expect((await q('select * from due_helper_alerts(10)'))).toEqual([])
    await expect(as(SON, null, () => q('select * from due_helper_alerts(10)'))).rejects.toThrow(/permission denied/)
  })
})

describe('hand-over', () => {
  it('moves a kept profile to the person\'s own account, optionally keeping access', async () => {
    await as(SON, null, () => q(`select share_transfer($1, 'dad@example.com', 'help')`, [DAD_KEPT_BY_SON]))
    await expect(as(SON, null, () => q(`select share_transfer($1, 'dad@example.com', null)`, [SON_P]))).rejects.toThrow(/own profile/)
    // Dad signs up (his own, still empty profile) and accepts.
    await q(`insert into health_profiles (owner_id, display_name) values ($1, 'New')`, [NEW_DAD])
    const transfer = (await sharesOf(NEW_DAD)).find((s) => s.kind === 'transfer')!
    expect(transfer).toMatchObject({ direction: 'received', keep_access: 'help' })
    await as(NEW_DAD, null, () => q('select share_respond($1, true, null, null, null, true)', [transfer.id]))

    const dad = (await q(`select owner_id, relationship from health_profiles where id = $1`, [DAD_KEPT_BY_SON]))[0]
    expect(dad).toEqual({ owner_id: NEW_DAD, relationship: 'self' })
    expect(await q(`select id from health_profiles where owner_id = $1`, [NEW_DAD])).toHaveLength(1)
    expect(await readings(NEW_DAD, DAD_KEPT_BY_SON)).toHaveLength(1)
    // The son kept "help" access because Dad agreed.
    expect(await readings(SON, DAD_KEPT_BY_SON)).toHaveLength(1)
  })

  it('refuses a hand-over into an account that already has its own records', async () => {
    await as(OTHER, null, () => q(`insert into vital_readings (profile_id, kind, weight_kg) values ($1, 'weight', 60)`, [OTHER_P]))
    await q(`insert into health_profiles (id, owner_id, relationship, display_name) values ('10000000-0000-0000-0000-0000000000b3', $1, 'parent', 'Aunt')`, [SON])
    await as(SON, null, () => q(`select share_transfer('10000000-0000-0000-0000-0000000000b3', 'other@example.com', null)`))
    const t = (await sharesOf(OTHER)).find((s) => s.kind === 'transfer')!
    await expect(as(OTHER, null, () => q('select share_respond($1, true)', [t.id]))).rejects.toThrow(/already has records/)
  })
})
