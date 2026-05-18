import { useGlobe } from '../../context/globeContext.ts';
import { REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';
import type { CSSProperties } from 'react';

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

interface RegionTabsProps {
  isPaneOpen?: boolean;
  onPaneOpen?: () => void;
  onPaneClose?: () => void;
}

export function RegionTabs({ isPaneOpen = true, onPaneOpen, onPaneClose }: RegionTabsProps) {
  const { selectedRegion, setSelectedRegion } = useGlobe();

  const handleExpandClick = (region: Region) => {
    const wasActive = region === selectedRegion;
    setSelectedRegion(region);
    if (isPaneOpen && wasActive) {
      onPaneClose?.();
    } else {
      onPaneOpen?.();
    }
  };

  return (
    <div className="region-tabs">
      {REGIONS.map((region) => (
        <div
          key={region}
          className={`region-tab ${region === selectedRegion ? 'active' : ''}`}
          style={{ '--tab-color': REGION_COLORS[region] } as CSSProperties}
        >
          <button
            className="region-tab__select"
            type="button"
            onClick={() => setSelectedRegion(region)}
          >
            {region}
          </button>
          {region === selectedRegion && (
            <button
              className={`region-tab__expand ${isPaneOpen ? 'region-tab__expand--open' : ''}`}
              type="button"
              onClick={() => handleExpandClick(region)}
              aria-label={`${isPaneOpen ? 'Close' : 'Open'} ${region} shows`}
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 11.5C4.8 7 7.4 4.5 12 4" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
