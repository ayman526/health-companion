import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/Home'
import { SignInPage } from './pages/SignIn'

// Home and sign-in load with the app; every other screen is downloaded the
// first time it's opened, so the first load stays small on mobile data.
const RecordsPage = lazy(() => import('./pages/Records').then((m) => ({ default: m.RecordsPage })))
const AdvisorPage = lazy(() => import('./pages/Advisor').then((m) => ({ default: m.AdvisorPage })))
const MedicationsPage = lazy(() => import('./pages/Medications').then((m) => ({ default: m.MedicationsPage })))
const TimelinePage = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.TimelinePage })))
const OnboardingPage = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.OnboardingPage })))
const ScanPage = lazy(() => import('./pages/Scan').then((m) => ({ default: m.ScanPage })))
const ReviewPage = lazy(() => import('./pages/Review').then((m) => ({ default: m.ReviewPage })))
const ReportDetailPage = lazy(() => import('./pages/ReportDetail').then((m) => ({ default: m.ReportDetailPage })))
const TestHistoryPage = lazy(() => import('./pages/TestHistory').then((m) => ({ default: m.TestHistoryPage })))
const ComparePage = lazy(() => import('./pages/Compare').then((m) => ({ default: m.ComparePage })))
const InsightsPage = lazy(() => import('./pages/Insights').then((m) => ({ default: m.InsightsPage })))
const MedicationFormPage = lazy(() => import('./pages/MedicationForm').then((m) => ({ default: m.MedicationFormPage })))
const MedicationDetailPage = lazy(() => import('./pages/MedicationDetail').then((m) => ({ default: m.MedicationDetailPage })))
const DocumentReviewPage = lazy(() => import('./pages/DocumentReview').then((m) => ({ default: m.DocumentReviewPage })))
const RemindersPage = lazy(() => import('./pages/Reminders').then((m) => ({ default: m.RemindersPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const FamilyCarePage = lazy(() => import('./pages/FamilyCare').then((m) => ({ default: m.FamilyCarePage })))
const SharingPage = lazy(() => import('./pages/Sharing').then((m) => ({ default: m.SharingPage })))
const TeamUsagePage = lazy(() => import('./pages/TeamUsage').then((m) => ({ default: m.TeamUsagePage })))
const LifestylePage = lazy(() => import('./pages/Lifestyle').then((m) => ({ default: m.LifestylePage })))
const MedicationEditPage = lazy(() => import('./pages/MedicationEdit').then((m) => ({ default: m.MedicationEditPage })))
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })))
const PrivacyPage = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.PrivacyPage })))
const VitalsPage = lazy(() => import('./pages/Vitals').then((m) => ({ default: m.VitalsPage })))
const FamilyPage = lazy(() => import('./pages/Family').then((m) => ({ default: m.FamilyPage })))
const SummaryPage = lazy(() => import('./pages/Summary').then((m) => ({ default: m.SummaryPage })))
const VisitsPage = lazy(() => import('./pages/Visits').then((m) => ({ default: m.VisitsPage })))
const VisitPage = lazy(() => import('./pages/Visit').then((m) => ({ default: m.VisitPage })))

// Screens people usually open next, fetched quietly once the app is idle.
const prefetchLikelyPages = () => {
  void import('./pages/Records')
  void import('./pages/Medications')
  void import('./pages/Advisor')
}

function Loading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="grid min-h-dvh place-items-center text-muted">
      {t('auth.loading')}
    </div>
  )
}

function Gate() {
  const { loading, session, self } = useAuth()
  // Onboarding is about the account holder; family members are added later.
  const ready = !!self?.onboarding_completed_at

  useEffect(() => {
    if (!ready) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    idle(prefetchLikelyPages)
  }, [ready])

  if (loading) return <Loading />
  if (!session) return <SignInPage />
  if (!ready) return <Suspense fallback={<Loading />}><OnboardingPage /></Suspense>

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
        <Route path="team/usage" element={<TeamUsagePage />} />
        <Route path="sharing" element={<SharingPage />} />
        <Route path="family-care" element={<FamilyCarePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="vitals" element={<VitalsPage />} />
        <Route path="family" element={<FamilyPage />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="visits" element={<VisitsPage />} />
        <Route path="visits/:visitId" element={<VisitPage />} />
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
