import { createHash, randomBytes } from 'crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/**
 * Генерирует PKCE пару для OAuth 2.1 authorization code flow.
 * verifier — 43 URL-safe base64 символа (32 байта энтропии).
 * challenge — BASE64URL(SHA256(verifier)).
 */
export function generatePkce(): PkcePair {
  const verifier = toBase64Url(randomBytes(32));
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
