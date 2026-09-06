import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { OverflowMenu } from '@/components/ui/overflow-menu';

function getTrigger(container: HTMLElement) {
  return container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
}

describe('OverflowMenu', () => {
  const items = [
    { label: 'Edit', onClick: () => {} },
    { label: 'Delete', onClick: () => {}, destructive: true },
    { label: 'Copy', onClick: () => {} },
  ];

  afterEach(() => {
    cleanup();
  });

  it('should render the trigger button with aria-haspopup', () => {
    const { container } = render(<OverflowMenu items={items} />);
    const trigger = getTrigger(container);
    expect(trigger).to.exist;
    expect(trigger.getAttribute('aria-haspopup')).to.equal('menu');
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
  });

  it('should open menu on click', () => {
    const { container } = render(<OverflowMenu items={items} />);
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(screen.getByRole('menu')).to.exist;
  });

  it('should render all menu items with role="menuitem"', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).to.have.lengthOf(3);
    expect(menuItems[0].textContent).to.equal('Edit');
    expect(menuItems[1].textContent).to.equal('Delete');
    expect(menuItems[2].textContent).to.equal('Copy');
  });

  it('should close menu when clicking outside', () => {
    render(
      <div>
        <span data-testid="outside">Outside</span>
        <OverflowMenu items={items} />
      </div>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('menu')).to.exist;

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).to.be.null;
  });

  it('should call onClick when menu item is clicked', () => {
    let clicked = '';
    const testItems = [
      { label: 'Edit', onClick: () => { clicked = 'edit'; } },
      { label: 'Delete', onClick: () => { clicked = 'delete'; } },
    ];
    render(<OverflowMenu items={testItems} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Delete'));
    expect(clicked).to.equal('delete');
  });

  it('should open menu with ArrowDown key on trigger', () => {
    const { container } = render(<OverflowMenu items={items} />);
    const trigger = getTrigger(container);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).to.exist;
  });

  it('should open menu with Enter key on trigger', () => {
    const { container } = render(<OverflowMenu items={items} />);
    const trigger = getTrigger(container);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('menu')).to.exist;
  });

  it('should close menu with Escape key', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('menu')).to.exist;

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).to.be.null;
  });

  it('should navigate items with ArrowDown/ArrowUp keys', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).to.equal('Edit');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).to.equal('Delete');

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).to.equal('Edit');
  });

  it('should jump to first item with Home key', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).to.equal('Delete');

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement?.textContent).to.equal('Edit');
  });

  it('should jump to last item with End key', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).to.equal('Copy');
  });

  it('should activate item with Enter key', () => {
    let clicked = '';
    const testItems = [
      { label: 'Edit', onClick: () => { clicked = 'edit'; } },
      { label: 'Delete', onClick: () => { clicked = 'delete'; } },
    ];
    render(<OverflowMenu items={testItems} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });

    expect(clicked).to.equal('delete');
    expect(screen.queryByRole('menu')).to.be.null;
  });

  it('should wrap around navigation from last to first', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).to.equal('Copy');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).to.equal('Edit');
  });

  it('should wrap around navigation from first to last', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement?.textContent).to.equal('Edit');

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).to.equal('Copy');
  });

  it('should restore focus to trigger button after Escape', () => {
    const { container } = render(<OverflowMenu items={items} />);
    const trigger = getTrigger(container);
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).to.exist;

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(document.activeElement).to.equal(trigger);
  });
});
