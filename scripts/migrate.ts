import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.NEXT_PUBLIC_DATABASE_URL;

const runMigration = async () => {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  console.log('Running migrations...');
  
  await migrate(db, { migrationsFolder: 'drizzle' });
  
  console.log('Migrations completed successfully');
  process.exit(0);
};

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 