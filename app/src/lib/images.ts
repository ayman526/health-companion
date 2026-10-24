/** Downsized JPEG of an image file (keeps the aspect ratio), or null if the browser can't read it. */
export async function resizeImage(file: Blob, maxEdge: number, maxBytes: number): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    for (const quality of [0.88, 0.78, 0.68]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= maxBytes) return blob
    }
  } catch {
    // Unsupported image format in this browser.
  }
  return null
}
