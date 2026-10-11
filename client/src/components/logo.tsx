import { cn } from '@/lib/utils';

// Hand-built to match the Sphere mark - two mirrored petal wings around a small
// center bar. Uses currentColor so it's black in light mode, white in dark mode,
// controlled entirely by the wrapper's text color (see className usage below).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M50 14 C68 17 78 27 78 39 C78 49 70 55 60 55 L52 55 C50 48 50 30 50 14 Z"
        fill="currentColor"
      />
      <path
        d="M50 86 C32 83 22 73 22 61 C22 51 30 45 40 45 L48 45 C50 52 50 70 50 86 Z"
        fill="currentColor"
      />
      <rect x="47" y="44" width="6" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ iconClassName, textClassName, className }: { iconClassName?: string; textClassName?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoMark className={cn('h-7 w-7 text-black dark:text-white', iconClassName)} />
      <span className={cn('text-lg font-semibold tracking-tight text-black dark:text-white', textClassName)}>
        Sphere
      </span>
    </div>
  );
}
