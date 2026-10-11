# Deployment readiness - make the app actually work once deployed

## Request
"check is there anything left in this project to optimize or to implement if not then start push it to github first then on vercel"

## Before
Running `npm run build` and auditing the codebase (rather than assuming it was ready) turned up real blockers - not nitpicks:

1. **`/explore` broke the production build outright.** `useQueryState` (nuqs, wraps `useSearchParams`) with no Suspense boundary - `next build`'s static prerendering fails on this every time, even though `next dev` never surfaces it.
2. **10 hardcoded `http://localhost:3000` / `http://localhost:4000` references** across both projects - the API base URL, the Socket.io connection, CORS origins, the Google OAuth redirect, and file uploads. None were configurable; deployed, the frontend would try to reach the developer's own laptop.
3. **Auth cookie would silently stop working once frontend and backend are on different domains.** `sameSite: 'lax'` with `secure: false` works locally, but a cross-site `fetch` (Vercel frontend -> Render backend, two different domains) never carries a `Lax` cookie at all - every authenticated request after deploy would look logged-out.
4. **Vercel can't run the NestJS backend.** Vercel serverless functions have no persistent process, and Socket.io (chat, typing indicators, presence, WebRTC call signaling) needs one. Decided with the project owner: Vercel for the Next.js client, Render for the NestJS server.
5. **No git repository existed yet**, and `client/` and `server/` each had their own leftover, mostly-empty nested `.git` folders from early scaffolding (`create-next-app`'s auto-init, an abandoned `nest new` init) - these would have made them git submodules instead of normal folders in the real repo.
6. **`server/.gitignore` had a path typo** (`/generated/prisma` instead of `/src/generated/prisma`) - the real generated Prisma client lives under `src/`, so the ignore rule silently didn't match it.
7. **A second, stray `server/generated/prisma` directory** (without `src/`) existed on disk, unused by any import, and was about to get committed wholesale - including a compiled wasm query engine binary.
8. Dead code: `client/src/app/auth/login/page.tsx` (an orphaned duplicate of the real `/login` page from early scaffolding, still using `alert()`, unlinked from anywhere) and `server/src/lib/upload.ts` (unused, browser-only upload logic mistakenly duplicated into the server package).
9. `client/src/middleware.ts` had an unused `import path from 'path/win32'` - Windows-specific, never called, and risky to leave since Next's middleware runs on the Edge runtime, where Node's `path` module isn't available at all.

## Implemented

### Fixed the build
- `explore/page.tsx`: split into an outer `ExplorePage` wrapping an inner `ExploreContent` in `<Suspense>`, per Next's documented fix for this exact error.

### Made URLs environment-driven
- New `client/src/lib/config.ts` exporting `API_URL` (`process.env.NEXT_PUBLIC_API_URL`, falling back to `http://localhost:4000` for local dev with zero setup). Used in `lib/api.tsx`, `lib/socket.ts`, `lib/upload.ts`, and the login/signup pages (both the credential POST and the "Continue with Google" link).
- Server: `main.ts`'s CORS origin, `chat.gateway.ts`'s Socket.io CORS origin, and `auth.controller.ts`'s post-Google-login redirect now read `process.env.CLIENT_URL`, falling back to `http://localhost:3000` locally.

### Fixed the auth cookie for cross-domain deployment
- `auth.controller.ts`: `secure`/`sameSite` now branch on `process.env.NODE_ENV === 'production'` - `secure: true, sameSite: 'none'` in production (required for a cross-site cookie to be sent at all), `secure: false, sameSite: 'lax'` locally (required since localhost is plain http, and `none` requires `secure`). `logout()`'s `clearCookie` call was updated to match - a clear call with different attributes than the original cookie doesn't actually clear it.

### Repo cleanup
- Removed the two nested `.git` folders inside `client/` and `server/` so the whole project is one real repository at the root.
- Fixed `server/.gitignore`'s path typo and deleted the stray `server/generated/prisma` directory.
- Deleted the dead `client/src/app/auth/login/page.tsx` and `server/src/lib/upload.ts`.
- Removed the unused, Edge-runtime-incompatible `import path from 'path/win32'` from `middleware.ts`.
- Added a root `.gitignore` (the root `node_modules` for the `concurrently` dev script wasn't covered by either subproject's gitignore).
- Added `server/.env.example` and `client/.env.example` documenting every required variable with placeholder values - no real secrets - so the repo is self-explanatory for setup without exposing anything.

## Files changed
`client/src/app/(main)/explore/page.tsx`, `client/src/lib/config.ts` (new), `client/src/lib/api.tsx`, `client/src/lib/socket.ts`, `client/src/lib/upload.ts`, `client/src/app/(auth)/login/page.tsx`, `client/src/app/(auth)/signup/page.tsx`, `client/src/middleware.ts`, `server/src/main.ts`, `server/src/chat/chat.gateway.ts`, `server/src/auth/auth.controller.ts`, `server/.gitignore`, `.gitignore` (new, root), `server/.env.example` (new), `client/.env.example` (new). Deleted: `client/src/app/auth/`, `server/src/lib/`, `server/generated/`, `client/.git/`, `server/.git/`.

## Verification
- `npx tsc --noEmit` clean on both projects.
- `npm run build` succeeds clean on the server (`nest build`).
- `npm run build` succeeds clean on the client (`next build`) - confirmed by actually running it after the fix, not assumed; all 16 routes built, `/explore` included.
- Full Playwright regression pass against the locally running (rebuilt) dev servers after all the changes: login still works (cookie still sets correctly in dev mode), `/explore` loads and its search (`?q=` query state) still works, the chat page still connects over the socket, settings page still works.
- `git status` double-checked by hand before the first commit: no real `.env` file staged, no `node_modules`, no generated Prisma client - only the two new `.env.example` files (placeholders, no real secrets).

## Still needed before this is actually live
This commit makes the codebase deployable - it does not deploy it by itself. Still to do, documented separately as they happen: push to GitHub, connect the repo to Render (backend) and Vercel (frontend), and set each platform's environment variables from the `.env.example` files (with real values, including `CLIENT_URL`/`NEXT_PUBLIC_API_URL` pointing at each other's actual deployed URLs once both exist).
