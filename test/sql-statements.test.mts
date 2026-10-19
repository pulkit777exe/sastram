import { describe, it } from 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { splitStatements } from '@/lib/utils/sql-statements';

describe('splitStatements', () => {
  it('splits plain statements on semicolons', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).to.deep.equal(['SELECT 1', 'SELECT 2']);
  });

  it('keeps dollar-quoted DO blocks intact', () => {
    const source = [
      'DO $$ BEGIN',
      "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'X') THEN",
      `    CREATE TYPE "X" AS ENUM ('A');`,
      '  END IF;',
      'END $$;',
      'ALTER TABLE "t" ADD COLUMN "x" TEXT;',
    ].join('\n');
    const statements = splitStatements(source);
    expect(statements).to.have.length(2);
    expect(statements[0]).to.include(`CREATE TYPE "X" AS ENUM`);
    expect(statements[0]).to.include('END $$');
    expect(statements[0]).to.include('END IF;');
    expect(statements[1]).to.equal('ALTER TABLE "t" ADD COLUMN "x" TEXT');
  });

  it('ignores semicolons inside single-quoted strings', () => {
    expect(splitStatements(`SELECT 'a;b'; SELECT 2;`)).to.deep.equal([`SELECT 'a;b'`, 'SELECT 2']);
  });

  it('handles escaped quotes inside strings and identifiers', () => {
    expect(splitStatements(`SELECT 'it''s; fine'; SELECT "co""l;umn";`)).to.deep.equal([
      `SELECT 'it''s; fine'`,
      `SELECT "co""l;umn"`,
    ]);
  });

  it('supports named dollar tags', () => {
    const source = `CREATE FUNCTION f() RETURNS void AS $body$ BEGIN PERFORM ';'; END $body$ LANGUAGE plpgsql; SELECT 1;`;
    const statements = splitStatements(source);
    expect(statements).to.have.length(2);
    expect(statements[0]).to.include('$body$');
    expect(statements[0]).to.include('END $body$');
    expect(statements[1]).to.equal('SELECT 1');
  });

  it('drops comment-only fragments', () => {
    expect(splitStatements('-- just a comment\n;')).to.deep.equal([]);
    expect(splitStatements('/* nothing here */;')).to.deep.equal([]);
  });

  it('matches the validated statement counts of the real migrations', () => {
    const count = (path: string) => splitStatements(readFileSync(path, 'utf8')).length;
    expect(count('prisma/migrations/20260530062139_initial/migration.sql')).to.equal(179);
    expect(count('prisma/migrations/20260906000000_add_welcome_email_sent/migration.sql')).to.equal(27);
    expect(count('prisma/migrations/20261019000000_perf_owner_indexes/migration.sql')).to.equal(18);
  });
});
