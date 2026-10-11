# Replace "Loading..." Text With a Real Spinner

## Before

Every loading state across the app was plain text: `<p>Loading...</p>`, `<p>Loading more...</p>`, `<p>Searching...</p>`, etc. - 12 occurrences across 10 files.

## Requested

Replace the text with an actual loading animation.

## Implemented

### New `client/src/components/spinner.tsx`

```tsx
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className="flex items-center justify-center p-6">
      <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />
    </div>
  );
}
```

Uses `lucide-react`'s `Loader2` icon (already a dependency, no new package) with Tailwind's built-in `animate-spin` - no custom CSS/keyframes needed.

### Swept every full-page/section loading state

Replaced in: `post-modal.tsx`, `comment-section.tsx`, `chat/page.tsx`, `explore/page.tsx` (3 occurrences: search results, post grid, infinite-scroll footer), `profile/edit/page.tsx`, `profile/page.tsx` (redirect loader), `profile/[username]/page.tsx` (2), `profile/requests/page.tsx`, `home/page.tsx` (2), `notifications/page.tsx` (2).

**Deliberately left alone**: `chat/[username]/page.tsx`'s "Load older messages" button, which toggles its own label to `"Loading..."` mid-click. That's a small in-place button-label change describing an in-progress action, not a page/content loading block - swapping it for an icon would replace the button's text entirely rather than complementing it, which is different UX than what was asked for.

## Verification

1. `npx tsc --noEmit` clean.
2. Live Playwright check: intercepted the `/posts` request and delayed it 2s to reliably catch the loading state, confirmed the spinner (`svg.animate-spin`) renders, and confirmed visually via screenshot - a clean, centered, spinning ring in place of the old text.
