import { isSameOriginMutation } from '../../../../../src/lib/server/route-origin-policy';

const mutation = (headers: Record<string, string>) =>
  new Request('https://vetlinx.example/api/account/sessions/revoke-all', {
    method: 'POST',
    headers,
  });

describe('same-origin browser mutation policy', () => {
  it('accepts an exact browser origin and rejects a foreign or opaque origin', () => {
    expect(
      isSameOriginMutation(mutation({ origin: 'https://vetlinx.example' })),
    ).toBe(true);
    expect(
      isSameOriginMutation(mutation({ origin: 'https://attacker.example' })),
    ).toBe(false);
    expect(isSameOriginMutation(mutation({ origin: 'null' }))).toBe(false);
    expect(isSameOriginMutation(mutation({ origin: '' }))).toBe(false);
  });

  it('rejects originless cross-site and same-site cross-origin browser requests', () => {
    expect(
      isSameOriginMutation(mutation({ 'sec-fetch-site': 'cross-site' })),
    ).toBe(false);
    expect(
      isSameOriginMutation(mutation({ 'sec-fetch-site': 'same-site' })),
    ).toBe(false);
    expect(
      isSameOriginMutation(mutation({ 'sec-fetch-site': 'same-origin' })),
    ).toBe(true);
  });

  it('uses referrer origin when Origin is missing and rejects malformed referrers', () => {
    expect(
      isSameOriginMutation(
        mutation({ referer: 'https://vetlinx.example/settings/security' }),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        mutation({ referer: 'https://attacker.example/form' }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(mutation({ referer: 'invalid referrer' })),
    ).toBe(false);
  });

  it('preserves headerless non-browser API clients and same-origin navigation clients', () => {
    expect(isSameOriginMutation(mutation({}))).toBe(true);
    expect(isSameOriginMutation(mutation({ 'sec-fetch-site': 'none' }))).toBe(
      true,
    );
    expect(
      isSameOriginMutation(
        mutation({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(false);
  });
});
