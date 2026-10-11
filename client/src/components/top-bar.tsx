import { Logo } from './logo';

export function TopBar() {
  return (
    <div className="sticky top-0 z-10 border-b bg-background p-4">
      <Logo />
    </div>
  );
}
