'use client';

import { useEffect } from 'react';
import { startTimeTracking } from '@/lib/time-tracker';

export function TimeTracker() {
  useEffect(() => startTimeTracking(), []);
  return null;
}
