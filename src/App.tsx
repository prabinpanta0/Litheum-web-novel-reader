import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Shell } from './components/layout/Shell';
import { LibraryPage } from './pages/LibraryPage';
import { NovelPage } from './pages/NovelPage';
import { HistoryPage } from './pages/HistoryPage';
import { ReaderPage } from './pages/ReaderPage';
import { SourcesPage } from './pages/SourcesPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { SyncManager } from './sync/SyncManager';
import { useApp } from './store/AppProvider';
import { setNetwork } from './plugins/network';

export default function App() {
  const { loading } = useApp();

  useEffect(() => {
    setNetwork({ mode: 'proxy', proxyRoot: '/https:' });
  }, []);

  if (loading) {
    return (
      <div className="boot-screen">
        <span className="boot-mark">L</span>
        <span className="boot-label">opening the reading room</span>
      </div>
    );
  }

  return (
    <>
      <SyncManager />
      <Routes>
        {/* The reader is a standalone, full-viewport experience without the
            app shell (top bar), so its own top/bottom chrome can manage
            visibility and it owns the scroll container. */}
        <Route
          path="/read/:sourceId/:novelPath/:chapterIndex"
          element={<ReaderPage />}
        />
        <Route
          path="*"
          element={
            <Shell>
              <Routes>
                <Route path="/" element={<LibraryPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/sources" element={<SourcesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/novel/:sourceId/:path" element={<NovelPage />} />
              </Routes>
            </Shell>
          }
        />
      </Routes>
    </>
  );
}
