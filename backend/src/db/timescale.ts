/**
 * TimescaleDB connection — session_messages only.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from '../config.js';
import * as timescaleSchema from './timescale-schema.js';

const tsClient = postgres(config.TIMESCALE_URL);
export const tsDb = drizzle(tsClient, { schema: timescaleSchema });
