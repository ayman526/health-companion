import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/Home'
import { RecordsPage } from './pages/Records'
import { AdvisorPage } from './pages/Advisor'
import { MedicationsPage } from './pages/Medications'
import { TimelinePage } from './pages/Timeline'
import { SignInPage } from './pages/SignIn'
import { OnboardingPage } from './pages/Onboarding'
import { ScanPage } from './pages/Scan'
import { ReviewPage } from './pages/Review'
import { ReportDetailPage } from './pages/ReportDetail'
import { TestHistoryPage } from './pages/TestHistory'
import { ComparePage } from './pages/Compare'
import { InsightsPage } from './pages/Insights'
import { MedicationFormPage } from './pages/MedicationForm'
import { MedicationDetailPage } from './pages/MedicationDetail'
import { DocumentReviewPage } from './pages/DocumentReview'
import { RemindersPage } from './pages/Reminders'
import { SettingsPage } from './pages/Settings'
import { LifestylePage } from './pages/Lifestyle'
import { MedicationEditPage } from './pages/MedicationEdit'
import { ProfilePage } from './pages/Profile'
import { PrivacyPage } from './pages/Privacy'

function Gate() {
  const { t } = useTranslation()
  const { loading, session, profile } = useAuth()

  if (loading) {
    return (
      <div role="status" className="grid min-h-dvh place-items-center text-muted">
        {t('auth.loading')}
      </div>
    )
  }
  if (!session) return <SignInPage />
  if (!profile?.onboarding_completed_at) return <OnboardingPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="records/scan" element={<ScanPage />} />
        <Route path="records/review/:reportId" element={<ReviewPage />} />
        <Route path="records/reports/:reportId" element={<ReportDetailPage />} />
        <Route path="records/tests/:testKey" element={<TestHistoryPage />} />
        <Route path="records/compare" element={<ComparePage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="advisor" element={<AdvisorPage />} />
        <Route path="medications" element={<MedicationsPage />} />
        <Route path="medications/new" element={<MedicationFormPage />} />
        <Route path="medications/:medicationId" element={<MedicationDetailPage />} />
        <Route path="medications/:medicationId/change" element={<MedicationFormPage />} />
        <Route path="medications/:medicationId/edit" element={<MedicationEditPage />} />
        <Route path="records/documents/:documentId" element={<DocumentReviewPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="lifestyle" element={<LifestylePage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
