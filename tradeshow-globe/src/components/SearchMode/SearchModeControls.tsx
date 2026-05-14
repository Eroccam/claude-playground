import { useGlobe } from '../../context/globeContext.ts';
import './SearchModeControls.css';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M5 10h14" />
    </svg>
  );
}

export function SearchModeControls() {
  const { isSearchMode, searchQuery, setSearchMode, setSearchQuery } = useGlobe();

  return (
    <>
      <div className="search-mode-pill" aria-label="Search and calendar controls">
        <button
          className={`search-mode-pill__half ${isSearchMode ? 'active' : ''}`}
          type="button"
          onClick={() => setSearchMode(!isSearchMode)}
          aria-label={isSearchMode ? 'Exit search mode' : 'Enter search mode'}
          aria-pressed={isSearchMode}
        >
          <SearchIcon />
        </button>
        <button
          className={`search-mode-pill__half ${!isSearchMode ? 'active' : ''}`}
          type="button"
          onClick={() => setSearchMode(false)}
          aria-label="Calendar view unavailable"
        >
          <CalendarIcon />
        </button>
      </div>

      <div className={`search-mode-input-wrap ${isSearchMode ? 'active' : ''}`}>
        <SearchIcon />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search shows by title or location"
          aria-label="Search shows"
        />
      </div>
    </>
  );
}
