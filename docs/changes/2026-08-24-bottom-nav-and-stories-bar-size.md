# Bottom Navigation & Smaller Stories Bar

## Before

- No shared layout existed for the `(main)` route group (`home`, `explore`, `create`, `create-story`) — each page rendered standalone with no persistent navigation. Switching between Home and Explore required manually typing the URL.
- `StoriesBar` rendered avatars at `h-14 w-14` (56px) with `p-3`/`gap-4` spacing — visually large relative to the rest of the UI.

## Requested

1. Add a bottom navigation bar so switching between pages doesn't require typing URLs.
2. Make the stories panel at the top smaller.

## Implemented

**New bottom nav** (`client/src/components/bottom-nav.tsx`, new file)

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, SquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/create', label: 'Create', icon: SquarePlus },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-white">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-label={label}
            className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5', active ? 'text-black' : 'text-gray-400')}>
            <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
          </Link>
        );
      })}
    </nav>
  );
}
```

**New shared layout** (`client/src/app/(main)/layout.tsx`, new file) — wraps every page in the `(main)` group so the nav is persistent without duplicating it per page:

```tsx
import { BottomNav } from '@/components/bottom-nav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col pb-14">
      {children}
      <BottomNav />
    </div>
  );
}
```

`Notifications` and `Profile` are intentionally left out of `NAV_ITEMS` — those routes don't exist yet (confirmed via `middleware.ts`, which already lists `/notifications` and `/profile` as protected paths for when they're built). Add them to `NAV_ITEMS` once those pages land.

**Smaller stories bar** (`client/src/components/stories-bar.tsx`)

```tsx
// before
<div className="flex gap-4 overflow-x-auto border-b p-3">
  <Link href="/create-story" className="flex flex-col items-center gap-1">
    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-gray-300">
      <Plus className="h-6 w-6 text-gray-400" />
    </div>
    <span className="text-xs">Your story</span>
  </Link>
  ...
  <Avatar className="h-14 w-14 border-2 border-white">...</Avatar>
  <span className="w-16 truncate text-center text-xs">{group.author.username}</span>

// after
<div className="flex gap-3 overflow-x-auto border-b p-2">
  <Link href="/create-story" className="flex flex-col items-center gap-1">
    <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-gray-300">
      <Plus className="h-4 w-4 text-gray-400" />
    </div>
    <span className="text-[11px]">Your story</span>
  </Link>
  ...
  <Avatar className="h-11 w-11 border-2 border-white">...</Avatar>
  <span className="w-14 truncate text-center text-[11px]">{group.author.username}</span>
```

Avatars/plus-button shrank from 56px to 44px, with tighter padding and gaps to match.

## Side fix (found while verifying in-browser)

Adding a `fixed bottom-0` nav collided visually with Next.js's own dev-only route indicator (the black "N" badge, default position `bottom-left` in dev mode — not present in production builds). Added `client/next.config.ts` (didn't exist before) to move it out of the way:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: { position: 'top-right' },
};

export default nextConfig;
```

Note: picking up a brand-new `next.config.ts` required a full `.next` cache clear, not just a dev-server restart — a one-time thing, not something that'll recur for normal edits.

## Verification

Started the dev servers, logged in as a seeded test user (`alex@example.com`), and screenshotted `/home` and `/explore` with Playwright to confirm the nav renders, highlights the active tab, doesn't overlap the dev indicator, and that the stories bar is visibly smaller.
