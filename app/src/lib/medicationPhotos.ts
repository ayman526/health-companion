import { supabase } from './supabase'
import { resizeImage } from './images'

const BUCKET = 'medical-documents'

/** Saves a photo of the user's medicine (private storage) and links it. Replaces any earlier photo. */
export async function setMedicationPhoto(profileId: string, medicationId: string, oldPath: string | null, file: File): Promise<boolean> {
  if (!supabase) return false
  const jpeg = await resizeImage(file, 1000, 1024 * 1024)
  if (!jpeg) return false
  const path = `${profileId}/medications/${medicationId}-${Date.now()}.jpg`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
  if (upErr) return false
  const { error } = await supabase.from('medications').update({ photo_path: path }).eq('id', medicationId)
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    return false
  }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
  return true
}

export async function removeMedicationPhoto(medicationId: string, path: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('medications').update({ photo_path: null }).eq('id', medicationId)
  if (error) return false
  await supabase.storage.from(BUCKET).remove([path])
  return true
}

/** Short-lived links for several photos at once (path → URL). */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || paths.length === 0) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]))
}
