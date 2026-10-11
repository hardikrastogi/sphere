'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useCall } from '@/hooks/useCall';

type CallContextValue = ReturnType<typeof useCall>;

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const call = useCall();
  return <CallContext.Provider value={call}>{children}</CallContext.Provider>;
}

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used within a CallProvider');
  return ctx;
}
