const STORAGE_KEY = 'sphere_time_spent_ms';
const TICK_MS = 15_000;

export function getTimeSpentMs(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
}

function addTimeSpent(ms: number) {
  const total = getTimeSpentMs() + ms;
  window.localStorage.setItem(STORAGE_KEY, String(total));
}

// Only counts time while this tab is actually the foreground tab, so it doesn't
// keep racking up minutes while Sphere is just open in a background tab.
export function startTimeTracking(): () => void {
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') addTimeSpent(TICK_MS);
  }, TICK_MS);
  return () => window.clearInterval(interval);
}

export function formatTimeSpent(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
