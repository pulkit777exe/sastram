import { describe, it, before, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, cleanup, act } from '@testing-library/react';
import React, { startTransition, useState } from 'react';
import { SaiViewTransition } from '@/components/ui/view-transition';
import { isViewTransitionsEnabled, supportsViewTransitions } from '@/lib/utils/view-transitions';

// jsdom does not implement CSS.escape, which React DOM uses to build view
// transition names. Provide the CSSOM escaping algorithm's observable subset.
if (typeof globalThis.CSS === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).CSS = {
    escape(value: string): string {
      return String(value).replace(
        /[^a-zA-Z0-9_-]/g,
        (ch) => `\\${ch.codePointAt(0)!.toString(16)} `
      );
    },
  };
}

const originalStartViewTransition = (document as unknown as Record<string, unknown>)
  .startViewTransition;

afterEach(() => {
  cleanup();
  if (originalStartViewTransition === undefined) {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
  } else {
    (document as unknown as Record<string, unknown>).startViewTransition = originalStartViewTransition;
  }
});

describe('SaiViewTransition', () => {
  it('passes flag and support helpers through without throwing', () => {
    expect(typeof isViewTransitionsEnabled()).to.equal('boolean');
    expect(typeof supportsViewTransitions()).to.equal('boolean');
  });

  describe('when browser supports View Transitions', () => {
    before(() => {
      (document as unknown as Record<string, unknown>).startViewTransition = (cb: () => void) => cb();
    });

    it('renders the children through React.ViewTransition', async () => {
      const { container } = render(
        <SaiViewTransition name="test-vt">
          <span data-testid="child">x</span>
        </SaiViewTransition>
      );
      await act(async () => {});
      const el = container.querySelector('[data-testid="child"]') as HTMLElement | null;
      expect(el).to.exist;
      expect(el!.textContent).to.equal('x');
    });

    it('starts a browser view transition for an async React update', async () => {
      let calls = 0;
      (document as unknown as Record<string, unknown>).startViewTransition = (arg: unknown) => {
        calls += 1;
        if (typeof arg === 'function') {
          (arg as () => void)();
        } else {
          (arg as { update: () => void }).update();
        }
        return {
          ready: Promise.resolve(),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        };
      };

      function App() {
        const [value, setValue] = useState('before');
        return (
          <>
            <button type="button" onClick={() => startTransition(() => setValue('after'))}>
              go
            </button>
            <SaiViewTransition name="test-vt">
              <span data-testid="child">{value}</span>
            </SaiViewTransition>
          </>
        );
      }

      const { container, getByText } = render(<App />);
      await act(async () => {
        getByText('go').click();
      });
      await act(async () => {});

      expect(container.querySelector('[data-testid="child"]')?.textContent).to.equal('after');
      expect(calls).to.be.greaterThan(0);
    });
  });

  describe('when browser does not support View Transitions', () => {
    it('renders children in a plain fragment', async () => {
      const { container } = render(
        <SaiViewTransition name="test-vt">
          <span data-testid="child">x</span>
        </SaiViewTransition>
      );
      await act(async () => {});
      const el = container.querySelector('[data-testid="child"]') as HTMLElement | null;
      expect(el).to.exist;
      expect(el!.textContent).to.equal('x');
    });
  });
});