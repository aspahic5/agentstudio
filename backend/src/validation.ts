import { z } from 'zod';

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map(i => i.message).join(', ');
    throw { statusCode: 400, message: `Validation error: ${issues}` };
  }
  return result.data;
}
