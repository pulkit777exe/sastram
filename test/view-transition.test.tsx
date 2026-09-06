import { describe, it, before, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { SaiViewTransition } from '@/components/ui/view-transition';
import { isViewTransitionsEnabled, supportsViewTransitions } from '@/lib/utils/view-transitions';

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

    it('renders the children via React.canary ViewTransition (which is a fragment-like marker)', async () => {
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