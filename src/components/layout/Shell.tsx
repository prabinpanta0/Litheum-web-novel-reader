import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { LibraryIcon, SearchIcon, SourcesIcon, HistoryIcon } from '../icons';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell-root">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="Litheum home">
            <img src="/logo.png" alt="" className="brand-logo" />
            <span className="brand-mark">Litheum</span>
          </NavLink>
          <nav className="topnav" aria-label="Primary">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `topnav-link ${isActive ? 'is-active' : ''}`
              }
              end
            >
              <LibraryIcon />
              <span>Library</span>
            </NavLink>
            <NavLink
              to="/search"
              className={({ isActive }) =>
                `topnav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <SearchIcon />
              <span>Search</span>
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `topnav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <HistoryIcon />
              <span>History</span>
            </NavLink>
            <NavLink
              to="/sources"
              className={({ isActive }) =>
                `topnav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <SourcesIcon />
              <span>Sources</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `topnav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <Settings size={18} />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
