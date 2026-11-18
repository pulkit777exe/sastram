import { config } from 'dotenv';
import 'global-jsdom/register';

// Override the ambient env: `bun run` may auto-load `.env` (production/Neon
// values) before the test setup runs. Tests must use `.env.test` exclusively.
config({ path: '.env.test', override: true });
