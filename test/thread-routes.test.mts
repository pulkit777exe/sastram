import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ROUTES } from '@/lib/config/routes';

describe('ROUTES.THREAD points at the real App Router page', () => {
  it('builds /dashboard/threads/<slug>', () => {
    expect(ROUTES.THREAD('my-thread-slug')).to.equal('/dashboard/threads/my-thread-slug');
  });

  it('does not target the legacy /thread/:slug redirect route', () => {
    // /thread/:slug still exists as a permanent redirect in next.config.ts.
    // Internal links must hit the actual page or every navigation pays a
    // redirect hop and revalidatePath calls become no-ops.
    expect(ROUTES.THREAD('abc')).to.not.match(/^\/thread\//);
  });
});
