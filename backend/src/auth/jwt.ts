import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secretKey = new TextEncoder().encode(config.JWT_SECRET);
const ISSUER = 'agent-studio';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretKey);
}

export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload & { exp: number }> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (payload.type === 'refresh') {
    throw { statusCode: 401, message: 'Invalid or expired token' };
  }
  return {
    sub: payload.sub!,
    email: payload.email as string,
    role: payload.role as string,
    exp: payload.exp!,
  };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (payload.type !== 'refresh') {
    throw { statusCode: 401, message: 'Invalid refresh token' };
  }
  return { sub: payload.sub!, type: 'refresh' };
}
