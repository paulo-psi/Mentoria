import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MoveHorizontal } from 'lucide-react';

type HorizontalTableViewportProps = {
  children: ReactNode;
  tableLabel: string;
  testId: string;
};

export function HorizontalTableViewport({
  children,
  tableLabel,
  testId,
}: HorizontalTableViewportProps) {
  const regionRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    const updateOverflow = () => {
      setHasOverflow(region.scrollWidth > region.clientWidth + 1);
    };
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateOverflow);
    const table = region.querySelector('table');

    updateOverflow();
    observer?.observe(region);
    if (table) observer?.observe(table);
    window.addEventListener('resize', updateOverflow);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [children]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    const distance = Math.max(80, Math.floor(event.currentTarget.clientWidth * 0.4));
    event.currentTarget.scrollLeft += event.key === 'ArrowRight' ? distance : -distance;
    event.preventDefault();
  };

  return (
    <div className="max-w-full">
      {hasOverflow && (
        <p
          className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground xl:hidden"
          data-testid={`${testId}-scroll-hint`}
          id={hintId}
        >
          <MoveHorizontal aria-hidden="true" className="shrink-0" size={15} />
          <span>Deslize para ver mais colunas. No teclado, foque a tabela e use ←/→.</span>
        </p>
      )}
      <div
        aria-describedby={hasOverflow ? hintId : undefined}
        aria-keyshortcuts={hasOverflow ? 'ArrowLeft ArrowRight' : undefined}
        aria-label={tableLabel}
        className="max-w-full touch-pan-x overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        data-testid={`${testId}-scroll-region`}
        onKeyDown={handleKeyDown}
        ref={regionRef}
        role="region"
        tabIndex={hasOverflow ? 0 : undefined}
      >
        {children}
      </div>
    </div>
  );
}