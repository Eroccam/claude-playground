import { Suspense } from 'react';
import './App.css';
import { GlobeScene } from './components/Globe/GlobeScene.tsx';
import { SidePanel } from './components/Panel/SidePanel.tsx';
import { MobileDrawer } from './components/Panel/MobileDrawer.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { GlobeProvider } from './context/GlobeContext.tsx';

function App() {
  return (
    <ErrorBoundary>
      <GlobeProvider>
        <div className="app-layout">
          <img
            src={`${import.meta.env.BASE_URL}safran-logo.png`}
            alt="Safran"
            className="top-logo"
          />
          <div className="globe-container">
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b8fad' }}>
                Loading...
              </div>
            }>
              <GlobeScene />
            </Suspense>
          </div>
          <div className="side-panel">
            <SidePanel />
          </div>
          <MobileDrawer />
        </div>
      </GlobeProvider>
    </ErrorBoundary>
  );
}

export default App;
