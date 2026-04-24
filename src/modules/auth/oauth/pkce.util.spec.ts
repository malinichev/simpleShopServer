import { createHash } from 'crypto';
import { generatePkce } from './pkce.util';

describe('generatePkce', () => {
  it('verifier длиной 43 url-safe base64 символа', () => {
    const { verifier } = generatePkce();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('challenge = BASE64URL(SHA256(verifier))', () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  it('method === S256', () => {
    expect(generatePkce().method).toBe('S256');
  });

  it('два последовательных вызова дают разные verifier', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
