import { describe, it } from 'mocha';
import { expect } from 'chai';
import type { ErrorEvent, Log } from '@sentry/core';
import { sentryPrivacyOptions, scrubSentryText } from '@/lib/observability/sentry';

describe('Sentry privacy options', () => {
  it('does not opt into default PII', () => {
    expect(sentryPrivacyOptions.sendDefaultPii).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.userInfo).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.cookies).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.httpHeaders).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.httpBodies).to.deep.equal([]);
    expect(sentryPrivacyOptions.dataCollection.urlQueryParams).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.genAI).to.deep.equal({ inputs: false, outputs: false });
    expect(sentryPrivacyOptions.dataCollection.databaseQueryData).to.equal(false);
    expect(sentryPrivacyOptions.dataCollection.stackFrameVariables).to.equal(false);
  });

  it('strips request data and the user object from error events', () => {
    const event = {
      request: {
        url: 'https://example.com/api/threads',
        cookies: { session: 'secret' },
        headers: { authorization: 'Bearer secret' },
        data: { password: 'secret' },
        query_string: 'token=secret',
      },
      user: { id: 'user-1', email: 'jane@example.com' },
    } as unknown as ErrorEvent;

    const result = sentryPrivacyOptions.beforeSend(event);

    expect(result.request?.url).to.equal('https://example.com/api/threads');
    expect(result.request?.cookies).to.equal(undefined);
    expect(result.request?.headers).to.equal(undefined);
    expect(result.request?.data).to.equal(undefined);
    expect(result.request?.query_string).to.equal(undefined);
    expect(result.user).to.equal(undefined);
  });

  it('masks emails and secret-looking attributes in logs', () => {
    const log: Log = {
      level: 'info',
      message: 'OTP sent to jane.doe@example.com',
      attributes: {
        email: 'jane@example.com',
        authorization: 'Bearer secret',
        threadId: 'thread-1',
      },
    };

    const result = sentryPrivacyOptions.beforeSendLog(log);

    expect(result.message).to.equal('OTP sent to j*******@example.com');
    expect(result.attributes?.email).to.equal('j***@example.com');
    expect(result.attributes?.authorization).to.equal('[REDACTED]');
    expect(result.attributes?.threadId).to.equal('thread-1');
  });

  it('scrubs embedded email addresses', () => {
    expect(scrubSentryText('a@b.com invited c@d.com')).to.equal('a*@b.com invited c*@d.com');
  });
});
