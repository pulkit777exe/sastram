import { describe, it } from 'mocha';
import { expect } from 'chai';
import { resolvePublicAddress, UnsafeUrlError } from '@/lib/services/safe-fetch';

function resolver(addresses: Array<{ address: string; family: number }>) {
  return async () => addresses;
}

describe('resolvePublicAddress (DNS-rebinding gate)', () => {
  it('returns a public DNS answer', async () => {
    const answer = await resolvePublicAddress(
      'example.com',
      resolver([{ address: '93.184.216.34', family: 4 }])
    );

    expect(answer).to.deep.equal({ address: '93.184.216.34', family: 4 });
  });

  it('rejects a DNS answer that points at loopback', async () => {
    let error: unknown;
    try {
      await resolvePublicAddress('rebind.example', resolver([{ address: '127.0.0.1', family: 4 }]));
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(UnsafeUrlError);
  });

  it('rejects the whole answer set when any address is private', async () => {
    let error: unknown;
    try {
      await resolvePublicAddress(
        'mixed.example',
        resolver([
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ])
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(UnsafeUrlError);
  });

  it('rejects private IPv6 answers', async () => {
    let error: unknown;
    try {
      await resolvePublicAddress('rebind.example', resolver([{ address: '::1', family: 6 }]));
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(UnsafeUrlError);
  });

  it('rejects private IP literals without consulting DNS', async () => {
    let error: unknown;
    try {
      await resolvePublicAddress('127.0.0.1');
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(UnsafeUrlError);
  });

  it('returns public IP literals', async () => {
    const answer = await resolvePublicAddress('1.1.1.1');
    expect(answer).to.deep.equal({ address: '1.1.1.1', family: 4 });
  });

  it('allows public IPv6 literals', async () => {
    const answer = await resolvePublicAddress('[2606:4700:4700::1111]');
    expect(answer).to.deep.equal({ address: '2606:4700:4700::1111', family: 6 });
  });
});
