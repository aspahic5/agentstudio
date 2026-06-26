/**
 * Environment configuration — fail-fast on missing required variables.
 *
 * All env vars used by the backend are validated here at startup.
 * If any required variable is missing, the process exits immediately.
 */

function requireEnv(name: string, minLength?: number): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  if (minLength && value.length < minLength) {
    console.error(`FATAL: ${name} must be at least ${minLength} characters`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  TIMESCALE_URL: requireEnv('TIMESCALE_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),
  LITELLM_BASE_URL: requireEnv('LITELLM_BASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET', 32),
  PORT: parseInt(optionalEnv('PORT', '3001'), 10),
  HOST: optionalEnv('HOST', '0.0.0.0'),
} as const;
