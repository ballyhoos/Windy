import { useEffect, useState } from 'react';
import { getShorelineForLocation } from '../lib/shorelineGrid';

type ShorelineOrientationCircleProps = {
  lat?: number;
  lon?: number;
  className?: string;
};

const SHORELINE_VISUAL_ROTATION_OFFSET_DEG = -90;
// Compass bearings are clockwise from North; CSS rotation starts from the 3 o'clock axis.

export function ShorelineOrientationCircle({ lat, lon, className }: ShorelineOrientationCircleProps) {
  const [rotationDeg, setRotationDeg] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        if (!cancelled) setRotationDeg(null);
        return;
      }

      const result = await getShorelineForLocation(lat, lon);
      if (cancelled) return;
      if (!result.available || typeof result.seaBearingDeg !== 'number') {
        setRotationDeg(null);
        return;
      }

      // Grid bearings are currently reversed for this dataset, so we flip by 180deg.
      setRotationDeg(result.seaBearingDeg + SHORELINE_VISUAL_ROTATION_OFFSET_DEG + 180);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (rotationDeg === null) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`shoreline-orientation-circle ${className ?? ''}`.trim()}
      style={{ transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)` }}
    />
  );
}
