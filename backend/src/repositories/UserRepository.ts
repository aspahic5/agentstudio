import { eq, count, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db/drizzle.js';
import { users, refreshTokens } from '../db/schema.js';

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export class UserRepository {
  async create(data: { email: string; name: string; passwordHash: string }) {
    const id = crypto.randomUUID();
    const email = data.email.toLowerCase();

    // Atomic first-user-is-admin: use a subquery so count + insert
    // see the same snapshot, preventing race conditions.
    const [user] = await db.insert(users).values({
      id,
      email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: sql`CASE WHEN (SELECT count(*) FROM users) = 0 THEN 'admin' ELSE 'user' END`,
    }).returning();

    return user;
  }

  async findByEmail(email: string) {
    return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  }

  async findById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    await db.insert(refreshTokens).values({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    });
  }

  async findRefreshToken(tokenHash: string) {
    return db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
  }

  async deleteRefreshToken(tokenHash: string) {
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async deleteAllRefreshTokens(userId: string) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }
}

export const userRepository = new UserRepository();
