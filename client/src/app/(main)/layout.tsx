import { BottomNav } from '@/components/bottom-nav';
import { CallOverlay } from '@/components/call-overlay';
import { CallProvider } from '@/contexts/call-context';
import { TimeTracker } from '@/components/time-tracker';
import { AuthGuard } from '@/components/auth-guard';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <CallProvider>
        <TimeTracker />
        <div className="flex min-h-full flex-1 flex-col pb-14">
          {children}
          <BottomNav />
        </div>
        <CallOverlay />
      </CallProvider>
    </AuthGuard>
  );
}
