import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold tracking-tight touch-manipulation select-none transition-all duration-150 active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_6px_16px_rgb(0_97_98_/_0.28)] hover:bg-accent-dark',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-transparent shadow-sm hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-ink-soft shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-paper-2',
        link: 'text-primary underline-offset-4 hover:underline',
        soft: 'bg-secondary text-accent-dark',
        green: 'bg-green text-success-foreground shadow-[0_6px_16px_rgb(27_107_74_/_0.26)]',
        dark: 'bg-m3-inverse-surface text-m3-inverse-on-surface',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm: 'h-9 rounded-xl px-3 text-sm',
        lg: 'min-h-14 px-5 py-3.5 text-[17px] rounded-[14px]',
        md: 'min-h-[46px] px-4 py-2.5 text-[15.5px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, icon, iconEnd, children, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
      {icon ? <span className="inline-flex">{icon}</span> : null}
      <span>{children}</span>
      {iconEnd ? <span className="inline-flex">{iconEnd}</span> : null}
    </Comp>
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
