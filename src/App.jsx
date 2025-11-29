import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Profile from './pages/Profile';
import VerifyEmail from './pages/VerifyEmail';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ScenesNavigationProvider } from './context/ScenesNavigationContext';

function App() {
  return (
    <AuthProvider>
      <ScenesNavigationProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Navigate to="/" replace />} />
            <Route path="register" element={<Navigate to="/" replace />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route
              path="profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </ScenesNavigationProvider>
    </AuthProvider>
  );
}

export default App;

