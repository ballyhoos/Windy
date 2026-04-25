import type { LocationOption, TideCondition } from '../types/conditions';

export async function fetchTideData(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<TideCondition> {
  if (options?.mockMode !== false) {
    return buildMockTide(location);
  }

  // TODO: Plug in a real tide API/provider for your region.
  throw new Error('Live tide provider not configured yet.');
}

function buildMockTide(location: LocationOption): TideCondition {
  const seed = Math.abs(Math.round(location.latitude * 1000) + Math.round(location.longitude * 100));
  const hourOffset = (seed % 5) + 1;
  const now = new Date();
  const nextHigh = new Date(now.getTime() + hourOffset * 60 * 60 * 1000);
  const nextLow = new Date(now.getTime() + (hourOffset + 3) * 60 * 60 * 1000);
  const stateIndex = seed % 3;
  const state = stateIndex === 0 ? 'incoming' : stateIndex === 1 ? 'outgoing' : 'slack';
  const currentRisk = seed % 8 === 0 ? 'high' : seed % 3 === 0 ? 'moderate' : 'low';

  return {
    nextHigh: nextHigh.toISOString(),
    nextLow: nextLow.toISOString(),
    state,
    currentRisk,
    note:
      currentRisk === 'high'
        ? 'Strong current around tide turn.'
        : currentRisk === 'moderate'
          ? 'Tide flow may add effort on the way back.'
          : 'Tide looks manageable for most paddlers.',
    sourceLabel: 'Mock tide data',
  };
}
