// Falls back to localhost for local dev; in production this must be set to the
// deployed backend's URL (e.g. a Render service), since it's baked in at build time.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
