'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import type { ThreadWithFullContext } from '@/modules/threads';

interface ParticipantsCardProps {
  thread: ThreadWithFullContext;
}

export default function ParticipantsCard({ thread }: ParticipantsCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  if (!thread.members.length) return null;

  const setShifts = (activeIdx: number | null, phase: 'in' | 'out') => {
    if (!rootRef.current) return;
    const cs = getComputedStyle(document.documentElement);
    const num = (name: string, fb: number) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) ? v : fb;
    };
    const ease = (name: string, fb: string) =>
      cs.getPropertyValue(name).trim() || fb;

    const lift = num('--avatar-lift', -4);
    const falloff = num('--avatar-falloff', 0.45);
    const scale = num('--avatar-scale', 1.05);
    const tf = phase === 'out'
      ? ease('--avatar-ease-out', 'cubic-bezier(0.34, 3.85, 0.64, 1)')
      : ease('--avatar-ease-in', 'cubic-bezier(0.22, 1, 0.36, 1)');

    rootRef.current.querySelectorAll('.t-avatar').forEach((el, i) => {
      const avatar = el as HTMLElement;
      avatar.style.transitionTimingFunction = tf;
      if (activeIdx == null) {
        avatar.style.setProperty('--shift', '0px');
        avatar.style.setProperty('--scale-active', '1');
        return;
      }
      const d = Math.abs(i - activeIdx);
      avatar.style.setProperty(
        '--shift',
        (lift * Math.pow(falloff, d)).toFixed(3) + 'px'
      );
      avatar.style.setProperty(
        '--scale-active',
        i === activeIdx ? String(scale) : '1'
      );
    });
  };

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
        Participants
      </p>

      <div
        ref={rootRef}
        className="t-avatar-group mt-[10px] flex flex-wrap gap-[8px]"
        onMouseLeave={() => setShifts(null, 'out')}
      >
        {thread.members.map((member, i) => (
          <div
            key={member.user.id}
            className={cn(
              't-avatar inline-flex items-center gap-[6px] rounded-[999px] bg-(--bg) px-[8px] py-[4px]'
            )}
            onMouseEnter={() => setShifts(i, 'in')}
          >
            <div className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-(--blue-dim)">
              <span className="text-[11px] font-medium text-(--blue)">
                {member.user.name?.slice(0, 1).toUpperCase() ?? 'U'}
              </span>
            </div>
            <span className="text-[12px] text-(--text)">{member.user.name ?? 'Unknown'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
