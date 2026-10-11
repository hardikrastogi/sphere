// Middleware always redirects "/" to /home or /login before this ever renders -
// this file only exists because Next.js requires a page component at the route.
export default function RootPage() {
  return null;
}
