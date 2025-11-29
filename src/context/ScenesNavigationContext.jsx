import { createContext, useContext, useState } from 'react';

const ScenesNavigationContext = createContext(null);

export function ScenesNavigationProvider({ children }) {
  const [showScenesList, setShowScenesList] = useState(true); // По умолчанию показываем список сцен

  const showScenes = () => setShowScenesList(true);
  const hideScenes = () => setShowScenesList(false);

  return (
    <ScenesNavigationContext.Provider value={{ showScenesList, showScenes, hideScenes }}>
      {children}
    </ScenesNavigationContext.Provider>
  );
}

export function useScenesNavigation() {
  const context = useContext(ScenesNavigationContext);
  if (!context) {
    throw new Error('useScenesNavigation must be used within ScenesNavigationProvider');
  }
  return context;
}

