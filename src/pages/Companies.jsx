import { useEffect } from 'react';
import { useFlowchartStore } from '../store/flowchartStore';
import { useAuth } from '../context/AuthContext';
import FlowchartCanvas from '../components/flowchart/FlowchartCanvas';
import PropertiesPanel from '../components/flowchart/PropertiesPanel';
import './Companies.css';

function Companies() {
  const { user, socketConnected } = useAuth();
  
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const clearAll = useFlowchartStore((state) => state.clearAll);
  const currentViewId = useFlowchartStore((state) => state.currentViewId);
  const navigateToRoot = useFlowchartStore((state) => state.navigateToRoot);
  
  // Состояние сохранения
  const isSaving = useFlowchartStore((state) => state.isSaving);
  const isLoading = useFlowchartStore((state) => state.isLoading);
  const loadFlowchart = useFlowchartStore((state) => state.loadFlowchart);
  const initSocketListeners = useFlowchartStore((state) => state.initSocketListeners);

  // Initialize socket listeners when connected
  useEffect(() => {
    if (socketConnected) {
      initSocketListeners();
    }
  }, [socketConnected, initSocketListeners]);

  // Автозагрузка при монтировании
  useEffect(() => {
    if (user && socketConnected) {
      loadFlowchart();
    }
  }, [user, socketConnected, loadFlowchart]);

  // Статистика
  const totalConnections = connections.length;

  return (
    <div className="companies-page">
      <div className="companies-header">
        <div className="header-left">
          <h1>Мои компании</h1>
          <p className="page-subtitle">Интерактивный редактор блок-схем</p>
        </div>
        
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{elements.length}</span>
            <span className="stat-label">Элементов</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{totalConnections}</span>
            <span className="stat-label">Связей</span>
          </div>
        </div>
        
        {/* Subtle saving indicator - fixed position, no layout shift */}
        <div className={`saving-indicator ${isSaving ? 'visible' : ''}`}>
          <span className="saving-icon">💾</span>
        </div>
        
        <div className="header-actions">
          {currentViewId && (
            <button 
              className="action-btn root-btn"
              onClick={navigateToRoot}
            >
              <span>🏠</span>
              В корень
            </button>
          )}
          
          {elements.length > 0 && (
            <button 
              className="action-btn clear-btn"
              onClick={() => {
                if (confirm('Удалить все элементы и связи?')) {
                  clearAll();
                }
              }}
            >
              <span>🗑️</span>
              Очистить
            </button>
          )}
        </div>
      </div>

      {/* Индикатор загрузки */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <span>⏳</span>
            <span>Загрузка схемы...</span>
          </div>
        </div>
      )}

      <div className="companies-content">
        <div className="flowchart-area">
          <FlowchartCanvas />
        </div>
        
        <aside className="properties-sidebar">
          <PropertiesPanel />
        </aside>
        
        <div className="help-tooltip">
          <span className="help-trigger">?</span>
          <div className="help-popup">
            <div className="help-row"><kbd>ПКМ</kbd> меню</div>
            <div className="help-row"><kbd>2×клик</kbd> внутрь</div>
            <div className="help-row"><kbd>Alt+ЛКМ</kbd> панорама</div>
            <div className="help-row"><kbd>Del</kbd> удалить</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Companies;
