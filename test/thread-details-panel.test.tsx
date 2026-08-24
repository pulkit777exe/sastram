import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThreadDetailsPanel } from '@/components/thread/thread-details-panel';

function getTrigger(container: HTMLElement) {
  return container.querySelector('button[aria-expanded]') as HTMLButtonElement;
}

describe('ThreadDetailsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render the trigger button with aria-expanded=false', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div>Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    expect(trigger).to.exist;
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
  });

  it('should not show panel content initially', () => {
    render(
      <ThreadDetailsPanel>
        <div data-testid="panel-content">Panel content</div>
      </ThreadDetailsPanel>
    );
    expect(screen.queryByTestId('panel-content')).to.be.null;
  });

  it('should open panel when trigger is clicked', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div data-testid="panel-content">Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(screen.getByTestId('panel-content')).to.exist;
  });

  it('should close panel with Escape key', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div data-testid="panel-content">Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(screen.getByTestId('panel-content')).to.exist;

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('panel-content')).to.be.null;
  });

  it('should set aria-hidden on backdrop when panel is open', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div>Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).to.exist;
  });

  it('should set aria-expanded on trigger when panel is open', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div>Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
  });

  it('should render panel with role="dialog" when open', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div>Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog).to.exist;
    expect(dialog.getAttribute('aria-modal')).to.equal('true');
  });

  it('should restore focus to trigger when panel closes', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div>Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).to.exist;

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).to.equal(trigger);
  });

  it('should open and close multiple times', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <div data-testid="panel-content">Panel content</div>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);

    // Open
    fireEvent.click(trigger);
    expect(screen.getByTestId('panel-content')).to.exist;

    // Close
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('panel-content')).to.be.null;

    // Open again
    fireEvent.click(trigger);
    expect(screen.getByTestId('panel-content')).to.exist;
  });

  it('should render panel content with children', () => {
    const { container } = render(
      <ThreadDetailsPanel>
        <p>Custom panel content</p>
      </ThreadDetailsPanel>
    );
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(screen.getByText('Custom panel content')).to.exist;
  });
});
