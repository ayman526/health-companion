import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { resizeImage } from './images'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const MAX_BYTES = 20 * 1024 * 1024

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

export type DocumentStatus =
  | 'uploaded' | 'processing' | 'needs_review' | 'confirmed' | 'discarded' | 'failed' | 'duplicate_blocked'

export type UploadOutcome =
  | { kind: 'uploaded'; documentId: string }
  | { kind: 'duplicate'; documentId: string; status: DocumentStatus }
  | { kind: 'invalid'; reason: 'type' | 'size' | 'empty' }
  | { kind: 'error' }

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const READING_COPY_MAX_EDGE = 2400
const READING_COPY_MAX_BYTES = 4.5 * 1024 * 1024

/**
 * Downsized JPEG for the extraction model, which accepts images up to 5 MB.
 * The original is always kept unchanged; this copy is only for reading.
 */
const makeReadingCopy = (file: File) => resizeImage(file, READING_COPY_MAX_EDGE, READING_COPY_MAX_BYTES)

export function validateFile(file: File): 'type' | 'size' | 'empty' | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > MAX_BYTES) return 'size'
  return null
}

/** Stores the original file privately and creates its document record (SPEC §3 steps 1–2). */
export async function uploadDocument(profileId: string, file: File): Promise<UploadOutcome> {
  if (!supabase) return { kind: 'error' }
  const invalid = validateFile(file)
  if (invalid) return { kind: 'invalid', reason: invalid }

  const sha256 = await sha256Hex(file)
  const { data: existing } = await supabase
    .from('medical_documents')
    .select('id, status, storage_path')
    .eq('profile_id', profileId)
    .eq('sha256', sha256)
    .maybeSingle()
  if (existing) {
    if (existing.status !== 'discarded' && existing.status !== 'failed') {
      return { kind: 'duplicate', documentId: existing.id, status: existing.status }
    }
    // A previously discarded or failed copy: remove it so the file can be processed again.
    await supabase.storage
      .from('medical-documents')
      .remove([existing.storage_path, existing.storage_path.replace(/[^/]+$/, 'for-reading.jpg')])
    await supabase.from('medical_documents').delete().eq('id', existing.id)
  }

  const id = crypto.randomUUID()
  const storagePath = `${profileId}/${id}/original.${EXT[file.type]}`
  const { error: insertError } = await supabase.from('medical_documents').insert({
    id,
    profile_id: profileId,
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
    sha256,
    title: file.name.slice(0, 200),
  })
  if (insertError) return { kind: 'error' }

  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    await supabase.from('medical_documents').delete().eq('id', id)
    return { kind: 'error' }
  }

  if (file.type.startsWith('image/')) {
    const copy = await makeReadingCopy(file)
    if (copy) {
      await supabase.storage
        .from('medical-documents')
        .upload(`${profileId}/${id}/for-reading.jpg`, copy, { contentType: 'image/jpeg', upsert: false })
    }
  }
  return { kind: 'uploaded', documentId: id }
}

export type StartOutcome = 'processing' | 'consent_required' | 'quota_exceeded' | 'ai_not_configured' | 'error'

export async function startExtraction(documentId: string): Promise<StartOutcome> {
  if (!supabase) return 'error'
  const { error } = await supabase.functions.invoke('extract-document', { body: { document_id: documentId } })
  if (!error) return 'processing'
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body.error === 'consent_required' || body.error === 'quota_exceeded' || body.error === 'ai_not_configured') return body.error
    } catch {
      // fall through
    }
  }
  return 'error'
}

export async function getDocumentStatus(documentId: string) {
  if (!supabase) return null
  const { data } = await supabase
    .from('medical_documents')
    .select('status, failure_reason, document_type')
    .eq('id', documentId)
    .maybeSingle()
  return data as { status: DocumentStatus; failure_reason: string | null; document_type: string | null } | null
}

/** The draft lab report created from a document, if extraction produced one. */
export async function draftReportFor(documentId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('laboratory_reports')
    .select('id')
    .eq('document_id', documentId)
    .eq('status', 'draft')
    .maybeSingle()
  return data?.id ?? null
}

export async function createManualReport(profileId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('laboratory_reports')
    .insert({ profile_id: profileId, status: 'draft', source: 'user_entered' })
    .select('id')
    .single()
  return error ? null : data.id
}

export async function hasAiConsent(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.rpc('my_consent', { p_type: 'ai_processing' })
  return data === true
}

export async function grantAiConsent(userId: string, version: string) {
  if (!supabase) return false
  const { error } = await supabase
    .from('user_consents')
    .insert({ user_id: userId, consent_type: 'ai_processing', version, granted: true })
  return !error
}

/**
 * Permanently deletes a scanned document the user doesn't want: the stored files,
 * the extraction and any unconfirmed drafts from it. Medicines, results or
 * reminders the user already confirmed from it stay (their link is cleared).
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  if (!supabase) return false
  const { data: doc } = await supabase.from('medical_documents').select('storage_path').eq('id', documentId).maybeSingle()
  if (!doc) return false
  await supabase.from('laboratory_results').update({ status: 'discarded' }).eq('document_id', documentId).eq('status', 'draft')
  await supabase.from('laboratory_reports').update({ status: 'discarded' }).eq('document_id', documentId).eq('status', 'draft')
  const { error } = await supabase.from('medical_documents').delete().eq('id', documentId)
  if (error) return false
  await supabase.storage.from('medical-documents').remove([doc.storage_path, doc.storage_path.replace(/[^/]+$/, 'for-reading.jpg')])
  return true
}
