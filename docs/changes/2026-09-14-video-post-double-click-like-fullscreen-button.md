# Video Posts: Double-Click Likes Instead of Opening Fullscreen

## Before

Video posts rendered with native browser `<video controls>`. In Chrome (and other Chromium-based browsers), double-clicking directly on a video's surface with native controls enabled triggers the browser's own built-in "toggle fullscreen" gesture - which fought with the double-click-to-like feature built a few days ago, since the two handlers competed for the same double-click.

## Requested

Double-clicking a video post should like it, never open fullscreen. Fullscreen should instead be reachable via an explicit button in the bottom-right corner.

## Implemented

### `client/src/components/post-card.tsx`

- Removed the `controls` attribute from the `<video>` element entirely - that's literally where the conflicting native double-click-fullscreen gesture lived.
- Added `autoPlay loop muted playsInline` so the video isn't left looking frozen/unplayable now that there's no play button - the standard convention every major feed (Instagram, TikTok, Twitter) uses for in-feed video.
- Added a custom fullscreen button, bottom-right corner, calling the real Fullscreen API on a `ref` to the video element:

```tsx
const videoRef = useRef<HTMLVideoElement>(null);

const enterFullscreen = (e: React.MouseEvent) => {
  e.stopPropagation(); // don't let this click also trigger the parent's double-click-to-like handler
  videoRef.current?.requestFullscreen();
};
```
```tsx
<video ref={videoRef} src={primaryMedia.url} autoPlay loop muted playsInline className="w-full" />
{primaryMedia.type === 'VIDEO' && (
  <button onClick={enterFullscreen} aria-label="Fullscreen" className="absolute bottom-2 right-2 ...">
    <Maximize className="h-4 w-4" />
  </button>
)}
```

The existing double-click-to-like handler on the wrapping `<div>` (from the earlier double-click-like feature) is untouched - it now fires cleanly without a native browser gesture competing for the same double-click.

## Why the browser's own controls reappear once in real fullscreen

Once `requestFullscreen()` actually enters native fullscreen, Chrome shows its own minimal playback controls (play/pause, seek, exit) automatically - this is separate from the `controls` HTML attribute (which only governs *inline* display) and is the correct, expected behavior: once someone has deliberately asked for fullscreen, they need a way to pause/seek/exit it.

## Verification

Live Playwright run with a real video post:
1. Confirmed the `controls` attribute is absent on the inline video element.
2. Double-clicked the video - confirmed it did **not** enter fullscreen, and confirmed the like heart-pop fired (post got liked).
3. Confirmed the fullscreen button is visible in the corner.
4. Clicked it - confirmed the browser genuinely entered fullscreen (`document.fullscreenElement` populated).
5. `npx tsc --noEmit` clean.
