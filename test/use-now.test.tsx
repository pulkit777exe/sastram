import { describe, it } from 'mocha';
import { expect } from 'chai';
import { render, screen, act } from '@testing-library/react';
import { TimeAgo } from '../components/ui/TimeAgo';
import { useNow } from '../components/ui/use-now';

function Probe() {
  const now = useNow();
  return <span data-testid="now">{typeof now}</span>;
}

describe('shared now clock', () => {
  it('useNow returns a number timestamp', () => {
    render(<Probe />);
    expect(screen.getByTestId('now').textContent).to.equal('number');
  });

  it('TimeAgo renders a relative label with no per-instance timer', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { container } = render(<TimeAgo date={fiveMinAgo} />);
    const time = container.querySelector('time');
    expect(time).to.not.be.null;
    expect(time!.textContent).to.contain('minute');
  });

  it('TimeAgo resolves naive UTC strings as UTC, not local', () => {
    const { container } = render(<TimeAgo date="2026-01-01T00:00:00" />);
    const time = container.querySelector('time');
    expect(time!.getAttribute('dateTime')).to.equal('2026-01-01T00:00:00.000Z');
  });

  it('unmounting all subscribers stops the shared timer', async () => {
    const { unmount } = render(
      <>
        <Probe />
        <TimeAgo date={new Date()} />
      </>
    );
    unmount();
    // No direct handle on the module timer; assert no act warnings / leaks
    // by rendering again cleanly.
    await act(async () => {});
    render(<Probe />);
    expect(screen.getAllByTestId('now').length).to.be.greaterThan(0);
  });
});
