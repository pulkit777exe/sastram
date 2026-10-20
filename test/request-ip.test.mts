import { describe, it } from 'mocha';
import { expect } from 'chai';
import { getRequestIp } from '@/lib/utils/request-ip';

function requestWith(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

describe('getRequestIp', () => {
  it('prefers the platform-authored x-real-ip header', () => {
    expect(
      getRequestIp(requestWith({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))
    ).to.equal('203.0.113.9');
  });

  it('uses the right-most forwarded hop so clients cannot rotate buckets', () => {
    expect(getRequestIp(requestWith({ 'x-forwarded-for': 'spoofed, 198.51.100.4' }))).to.equal(
      '198.51.100.4'
    );
  });

  it('trims empty forwarded entries', () => {
    expect(getRequestIp(requestWith({ 'x-forwarded-for': ' , 198.51.100.7 , ' }))).to.equal(
      '198.51.100.7'
    );
  });

  it('falls back when no address header is present', () => {
    expect(getRequestIp(requestWith({}))).to.equal('unknown');
  });
});
