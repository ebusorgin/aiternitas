import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Footer from './Footer';
import Preloader from './Preloader';
import './Layout.css';

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Не показываем Footer на страницах входа и регистрации
  const showFooter = !['/login', '/register'].includes(location.pathname);
  // Показываем Sidebar только для авторизованных пользователей
  const showSidebar = user && !loading;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Показываем прелоадер во время проверки авторизации
  if (loading) {
    return <Preloader />;
  }

  return (
    <div className={`layout ${showSidebar ? 'with-sidebar' : 'no-sidebar'}`}>
      {showSidebar && (
        <>
          <button
            className={`mobile-menu-toggle ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Открыть меню"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div
            className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          ></div>

          <Sidebar
            user={user}
            loading={loading}
            onLogout={handleLogout}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </>
      )}


      <main className="main-content">
        <Outlet />
      </main>
      
      {showFooter && <Footer />}
    </div>
  );
}

export default Layout;

