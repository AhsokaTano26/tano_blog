'use client';

import * as Primitive from '@radix-ui/react-tooltip';
import { useState, type ReactElement, type ReactNode } from 'react';

interface TooltipProps {
  content?: ReactNode;
  children: ReactElement;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const hasContent = content !== undefined && content !== null && content !== '' && content !== false;
  return <Primitive.Provider delayDuration={250} skipDelayDuration={100}>
    <Primitive.Root open={hasContent && open} onOpenChange={setOpen}>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content className="admin-ui-tooltip" sideOffset={7} collisionPadding={8}>
          {content}
          <Primitive.Arrow className="admin-ui-tooltip-arrow" width={10} height={5} />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  </Primitive.Provider>;
}
