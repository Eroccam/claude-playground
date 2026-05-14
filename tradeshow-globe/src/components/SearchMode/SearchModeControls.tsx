import { useGlobe } from '../../context/globeContext.ts';
import './SearchModeControls.css';

interface SearchModeControlsProps {
  onExpandPanel?: () => void;
}

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

export function SearchModeControls({ onExpandPanel }: SearchModeControlsProps) {
  const { isSearchMode, searchQuery, setSearchMode, setSearchQuery } = useGlobe();

  const handleSearchIconClick = () => {
    if (!isSearchMode) {
      setSearchMode(true);
    }
    onExpandPanel?.();
  };

  return (
    <div
      className={`search-mode-pill ${isSearchMode ? 'search-mode-pill--expanded' : ''}`}
      aria-label="Search and calendar controls"
    >
      <button
        className={`search-mode-pill__icon-btn ${isSearchMode ? 'active' : ''}`}
        type="button"
        onClick={handleSearchIconClick}
        aria-label={isSearchMode ? 'Expand search panel' : 'Enter search mode'}
        aria-pressed={isSearchMode}
      >
        <SearchIcon />
      </button>
      <input
        className="search-mode-pill__input"
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClick={() => onExpandPanel?.()}
        placeholder="Search shows by title or location"
        aria-label="Search shows"
        tabIndex={isSearchMode ? 0 : -1}
      />
      <button
        className={`search-mode-pill__icon-btn ${!isSearchMode ? 'active' : ''}`}
        type="button"
        onClick={() => setSearchMode(false)}
        aria-label="Exit search mode"
      >
        <CalendarIcon />
      </button>
    </div>
  );
}
