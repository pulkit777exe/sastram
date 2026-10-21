import packageJson from '@/package.json';

/** Version of the running build, exposed on health/diagnostics endpoints. */
export const APP_VERSION = packageJson.version;
