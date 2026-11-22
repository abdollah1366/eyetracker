import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireRole } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/layout/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Participants } from './pages/Participants';
import { ParticipantDetail } from './pages/ParticipantDetail';
import { SessionWizard } from './pages/SessionWizard';
import { SessionDetail } from './pages/SessionDetail';
import { Assessments } from './pages/Assessments';
import { ModelLab } from './pages/ModelLab';
import { GlobalHeatmapPage } from './pages/GlobalHeatmapPage';
import { Admin } from './pages/Admin';
import { SyncCenter } from './pages/SyncCenter';

function ProtectedShell() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/participants" element={<Participants />} />
              <Route path="/participants/:id" element={<ParticipantDetail />} />
              <Route path="/sessions/new" element={<SessionWizard />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/assessments" element={<Assessments />} />
              <Route path="/models" element={<ModelLab />} />
              <Route path="/heatmap" element={<GlobalHeatmapPage />} />
              <Route
                path="/admin"
                element={
                  <RequireRole roles={['admin']}>
                    <Admin />
                  </RequireRole>
                }
              />
              <Route path="/sync" element={<SyncCenter />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
