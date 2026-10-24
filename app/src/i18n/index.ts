import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ar from './ar.json'

export type Language = 'en' | 'ar'

const STORAGE_KEY = 'hc.language'

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ar') return saved
  } catch {
    // Storage can be blocked; fall back to the browser language.
  }
  return navigator.language.startsWith('ar') ? 'ar' : 'en'
}

function applyDocumentDirection(lang: Language) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Non-critical: the choice just won't persist on this device.
  }
  void i18n.changeLanguage(lang)
}

i18n.on('languageChanged', (lng) => applyDocumentDirection(lng as Language))

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

applyDocumentDirection(i18n.language as Language)

export default i18n
