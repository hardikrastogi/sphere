import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A centered spinner for a full section/page loading state (replaces plain "Loading..." text). */
export function Spinner({ className }: { className?: string }) {
  return (
    <div className="flex items-center justify-center p-6">
      <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />
    </div>
  );
}
