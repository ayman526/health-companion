import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Libraries change far less often than the app, so they get their own files:
// after an app update, phones re-download only the app code, not React or Supabase.
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'],
  supabase: ['@supabase'],
  i18n: ['i18next', 'react-i18next'],
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const pkg = id.split('node_modules/').pop()!
          for (const [chunk, prefixes] of Object.entries(VENDOR_CHUNKS)) {
            if (prefixes.some((p) => pkg === p || pkg.startsWith(`${p}/`))) return chunk
          }
        },
      },
    },
  },
})
