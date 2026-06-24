/**
 * Main PostgreSQL connection — all tables except session_messages.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from '../config.js';
import * as schema from './schema.js';

const queryClient = postgres(config.DATABASE_URL);
export const db = drizzle(queryClient, { schema });
