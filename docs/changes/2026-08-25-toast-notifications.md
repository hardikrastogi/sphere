# Toast Feedback (Sonner)

## Before

- All error handling across the app was `alert(err.message)` — 6 call sites (login, signup, create post, create story, edit profile), a blocking native browser dialog.
- Several actions gave **no feedback at all** on success or failure: sending/canceling a follow request, accepting/rejecting a request, liking a post (silently reverted on failure), and commenting (failure was completely unhandled — the input just sat there with nothing posted and no error).

## Requested

Add toast notifications using shadcn's Sonner component (https://ui.shadcn.com/docs/components/radix/sonner), added inline rather than via a separate wrapper file in `components/ui/`.

## Implemented

- Installed `sonner` directly (skipped the usual `npx shadcn add sonner` scaffold, which would generate a `components/ui/sonner.tsx` theme wrapper — per your ask, no new file was created for it).
- Added `<Toaster position="top-center" richColors />` once, directly in `app/providers.tsx` (the existing central client-providers wrapper), so `toast()` is callable from anywhere with no per-page setup:

```tsx
// providers.tsx
<NuqsAdapter>
  {children}
  <Toaster position="top-center" richColors />
</NuqsAdapter>
```

- **Replaced all 6 `alert()` call sites** with `toast.error(err.message)`: `(auth)/login`, `(auth)/signup`, `(main)/create`, `(main)/create-story`, `(main)/profile/edit`. (Left the one stray `alert()` in `app/auth/login/page.tsx` alone — that's an orphaned duplicate of `(auth)/login/page.tsx` at a different, unlinked URL, noted during the earlier profile survey; touching it felt like scope creep for this pass, flagging it here in case you want it deleted.)
- **Added toasts where there was previously silent success/failure:**
  - `profile/[username]/page.tsx` — `toast.success('Follow request sent')` / error toast on failure; unfollow/cancel gets an error toast on failure.
  - `profile/requests/page.tsx` and `notifications/page.tsx` — `toast.success('Request accepted' / 'Request rejected')`, error toast on failure, on both the id-based and username-based accept/reject flows.
  - `post-card.tsx` — like/unlike now toasts an error on failure (success stays silent — the heart filling in is already visible feedback, and it fires on every click so a success toast there would just be noise).
  - `comment-section.tsx` — previously a failed comment POST did *nothing visible at all*; now toasts an error.
  - `create/page.tsx` / `create-story/page.tsx` — added `toast.success('Post shared!' / 'Story shared!')` right before the redirect to `/home`.
  - `profile/edit/page.tsx` — added `toast.success('Profile updated')`.

## Verification

Playwright screenshots confirm both ends of the pattern render correctly: a real follow-request click shows the green "Follow request sent" toast (`richColors` styling), and a deliberately wrong password on login shows the red "Invalid credentials" toast — both top-center, both auto-dismissing.
