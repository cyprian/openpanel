import { cn } from '@/utils/cn';

interface LogoProps {
  className?: string;
  src?: string | null;
}

export function LogoSquare({ className, src }: LogoProps) {
  return (
    <img
      src={src || '/logo.png'}
      className={cn('rounded-md', className)}
      alt="Openpanel logo"
    />
  );
}

export function Logo({ className, src }: LogoProps) {
  return (
    <div
      className={cn('flex items-center gap-2 text-xl font-medium', className)}
    >
      <LogoSquare className="max-h-8" src={src} />
      <span>openpanel.dev</span>
    </div>
  );
}
