import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  appendPgbouncerParam,
  hasPgbouncerParam,
  isNeonConnectionString,
  resolvePrismaConnection,
} from '../lib/infrastructure/prisma';

const NEON_DIRECT =
  'postgresql://user:pass@ep-cool-name-123.us-east-2.aws.neon.tech/sastram?sslmode=require';
const NEON_POOLED =
  'postgresql://user:pass@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/sastram?sslmode=require';
const POOLER_WITHOUT_NEON =
  'postgresql://user:pass@db-pooler.example.com:6432/sastram?sslmode=require';
const LOCAL_POSTGRES = 'postgresql://sastram:sastram_dev@db:5432/sastram';

describe('Prisma adapter selection', () => {
  describe('isNeonConnectionString', () => {
    it('detects direct neon.tech hosts', () => {
      expect(isNeonConnectionString(NEON_DIRECT)).to.equal(true);
    });

    it('detects pooled neon.tech hosts', () => {
      expect(isNeonConnectionString(NEON_POOLED)).to.equal(true);
    });

    it('detects pooler hosts even without a neon.tech domain', () => {
      expect(isNeonConnectionString(POOLER_WITHOUT_NEON)).to.equal(true);
    });

    it('does not classify local or self-hosted Postgres as Neon', () => {
      expect(isNeonConnectionString(LOCAL_POSTGRES)).to.equal(false);
      expect(
        isNeonConnectionString('postgresql://user:pass@postgres.internal:5432/sastram')
      ).to.equal(false);
    });
  });

  describe('hasPgbouncerParam', () => {
    it('detects an existing pgbouncer=true parameter', () => {
      expect(hasPgbouncerParam(`${NEON_POOLED}&pgbouncer=true`)).to.equal(true);
      expect(hasPgbouncerParam('postgresql://host/db?pgbouncer=true&sslmode=require')).to.equal(
        true
      );
    });

    it('does not treat pgbouncer=false or an absent parameter as enabled', () => {
      expect(hasPgbouncerParam('postgresql://host/db?pgbouncer=false')).to.equal(false);
      expect(hasPgbouncerParam(NEON_DIRECT)).to.equal(false);
    });
  });

  describe('appendPgbouncerParam', () => {
    it('uses ? when the URL has no query string', () => {
      expect(appendPgbouncerParam(NEON_DIRECT.replace('?sslmode=require', ''))).to.equal(
        `${NEON_DIRECT.replace('?sslmode=require', '')}?pgbouncer=true`
      );
    });

    it('uses & when the URL already has a query string', () => {
      expect(appendPgbouncerParam(NEON_DIRECT)).to.equal(`${NEON_DIRECT}&pgbouncer=true`);
    });

    it('preserves a trailing slash and existing query string', () => {
      const url =
        'postgresql://user:pass@ep-cool-name-123-pooler.neon.tech/sastram/?sslmode=require';
      expect(appendPgbouncerParam(url)).to.equal(`${url}&pgbouncer=true`);
    });

    it('does not create an empty query pair when the URL ends in ? or &', () => {
      expect(appendPgbouncerParam('postgresql://host/db?')).to.equal(
        'postgresql://host/db?pgbouncer=true'
      );
      expect(appendPgbouncerParam('postgresql://host/db?sslmode=require&')).to.equal(
        'postgresql://host/db?sslmode=require&pgbouncer=true'
      );
    });
  });

  describe('resolvePrismaConnection', () => {
    it('appends pgbouncer and selects PrismaNeon for a direct Neon URL in production', () => {
      const resolved = resolvePrismaConnection(NEON_DIRECT, true);
      expect(resolved.adapter).to.equal('neon');
      expect(resolved.appendedPgbouncer).to.equal(true);
      expect(resolved.connectionString).to.equal(`${NEON_DIRECT}&pgbouncer=true`);
    });

    it('appends pgbouncer and selects PrismaNeon for a pooler URL in production', () => {
      const resolved = resolvePrismaConnection(NEON_POOLED, true);
      expect(resolved.adapter).to.equal('neon');
      expect(resolved.appendedPgbouncer).to.equal(true);
      expect(resolved.connectionString).to.equal(`${NEON_POOLED}&pgbouncer=true`);
    });

    it('does not append pgbouncer or select PrismaNeon for local Postgres in production', () => {
      const resolved = resolvePrismaConnection(LOCAL_POSTGRES, true);
      expect(resolved.adapter).to.equal('pg');
      expect(resolved.appendedPgbouncer).to.equal(false);
      expect(resolved.connectionString).to.equal(LOCAL_POSTGRES);
    });

    it('does not append pgbouncer outside production', () => {
      const resolved = resolvePrismaConnection(NEON_DIRECT, false);
      expect(resolved.adapter).to.equal('neon');
      expect(resolved.appendedPgbouncer).to.equal(false);
      expect(resolved.connectionString).to.equal(NEON_DIRECT);
    });

    it('does not duplicate an existing pgbouncer parameter in production', () => {
      const url = `${NEON_POOLED}&pgbouncer=true`;
      const resolved = resolvePrismaConnection(url, true);
      expect(resolved.adapter).to.equal('neon');
      expect(resolved.appendedPgbouncer).to.equal(false);
      expect(resolved.connectionString).to.equal(url);
      expect(resolved.connectionString.match(/pgbouncer=true/g)).to.have.length(1);
    });

    it('preserves query strings and trailing slashes when appending in production', () => {
      const url =
        'postgresql://user:pass@ep-cool-name-123-pooler.neon.tech/sastram/?sslmode=require';
      const resolved = resolvePrismaConnection(url, true);
      expect(resolved.connectionString).to.equal(`${url}&pgbouncer=true`);
    });
  });
});
