import { useGlobe } from '../../context/GlobeContext.tsx';
import { REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

export function RegionTabs() {
  const { selectedRegion, setSelectedRegion } = useGlobe();

  return (
    <div className="region-tabs">
      {REGIONS.map((region) => (
        <button
          key={region}
          className={`region-tab ${region === selectedRegion ? 'active' : ''}`}
          style={{ '--tab-color': REGION_COLORS[region] } as React.CSSProperties}
          onClick={() => setSelectedRegion(region)}
        >
          {region}
        </button>
      ))}
    </div>
  );
}
