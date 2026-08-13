'use client';

import { useEffect, useState } from 'react';

/* ─────────────────────────────────────────────────────────
 * TASK ROWS
 * Displays multi-task workflow progress with expandable
 * detail steps, status ring spinners, success/fail badges.
 * ───────────────────────────────────────────────────────── */

type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TaskDetail {
  label: string;
  meta?: string;
}

export interface Task {
  key: string;
  label: string;
  meta?: string;
  status: TaskStatus;
  details?: TaskDetail[];
  /** Custom pill — if omitted, a default pill is rendered based on status */
  pill?: React.ReactNode;
}

interface TaskRowsProps {
  tasks: Task[];
  variant?: 'Capsules' | 'List';
}

function SpinnerRing({ active, children }: { active?: boolean; children?: React.ReactNode }) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: 'spin 1.1s linear infinite' } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">
        {children}
      </span>
    </span>
  );
}

function StatusBadge({ status, index }: { status: TaskStatus; index: number }) {
  if (status === 'running') {
    return <SpinnerRing active>{index + 1}</SpinnerRing>;
  }
  if (status === 'pending') {
    return <SpinnerRing>{index + 1}</SpinnerRing>;
  }
  if (status === 'done') {
    return (
      <span
        className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-green text-white"
        style={{ animation: 'pop-in 300ms cubic-bezier(0.23,1,0.32,1) both' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  // failed
  return (
    <span
      className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-red text-white"
      style={{ animation: 'pop-in 300ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </span>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  if (status === 'done') {
    return (
      <span
        className="inline-flex h-5.5 items-center rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green"
        style={{ animation: 'fade-in 200ms ease-out both' }}
      >
        Completed
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        className="inline-flex h-5.5 items-center gap-1.5 rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red"
        style={{ animation: 'fade-in 200ms ease-out both' }}
      >
        Failed
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: 'spin 1.2s linear infinite' }}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </svg>
      </span>
    );
  }
  return null;
}

export function TaskRows({ tasks, variant = 'Capsules' }: TaskRowsProps) {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const list = variant === 'List';

  const toggle = (key: string) =>
    setOpenRows((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div
      className={`flex w-full flex-col ${
        list ? 'gap-0 self-start overflow-hidden rounded-card bg-surface shadow-card' : 'min-h-[196px] gap-2'
      }`}
    >
      {tasks.map((task, i) => {
        const open = openRows[task.key] ?? false;
        return (
          <div
            key={task.key}
            className={`self-stretch overflow-hidden transition-[border-radius] duration-300 ${
              list ? 'border-b border-line last:border-0' : 'bg-surface shadow-card'
            }`}
            style={{
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(task.key)}
              className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left transition-colors duration-100 hover:bg-inset"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <StatusBadge status={task.status} index={i} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {task.label}
              </span>
              {task.meta && (
                <span className="text-[12.5px] text-ink-2 tabular-nums">{task.meta}</span>
              )}
              {task.pill ?? <StatusPill status={task.status} />}
              <span
                aria-hidden
                className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            {/* Expandable detail */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{
                gridTemplateRows: open ? '1fr' : '0fr',
                opacity: open ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5">
                    {(task.details ?? []).map((d, j) => (
                      <div
                        key={d.label}
                        className="flex items-center justify-between"
                        style={
                          open
                            ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 100}ms both` }
                            : undefined
                        }
                      >
                        <span className="text-[12px] text-ink-2">{d.label}</span>
                        {d.meta && (
                          <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
                            {d.meta}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
