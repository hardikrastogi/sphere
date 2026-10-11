'use client';

import { useState } from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { store } from '../store';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <NuqsAdapter>
            {children}
            <Toaster position="top-center" richColors />
          </NuqsAdapter>
        </QueryClientProvider>
      </Provider>
    </ThemeProvider>
  );
}