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
          <button
            className={`region-tab__expand ${isPaneOpen && region === selectedRegion ? 'region-tab__expand--open' : ''}`}
            type="button"
            onClick={() => handleExpandClick(region)}
            aria-label={`${isPaneOpen && region === selectedRegion ? 'Close' : 'Open'} ${region} shows`}
          />
        </div>
      ))}
    </div>
  );
}
