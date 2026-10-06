import { ConfigService } from '@nestjs/config';
import { MailQueueService } from './mail-queue.service';

describe('Encrypted delivery content', () => {
  const text =
    'One-use account recovery link: https://vetlinx.test/reset?token=private-token';
  const queue = (key = 'a1'.repeat(32)) =>
    new MailQueueService(
      new ConfigService({
        NODE_ENV: 'production',
        DELIVERY_ENCRYPTION_KEY: key,
      }),
    );

  it('round-trips content using authenticated encryption with a fresh nonce per message', () => {
    const first = queue().encrypt(text);
    const second = queue().encrypt(text);
    expect(first).not.toBe(second);
    expect(first).not.toContain('private-token');
    expect(queue().decrypt(first)).toBe(text);
    expect(queue().decrypt(second)).toBe(text);
  });

  it('rejects modified ciphertext and authentication tags', () => {
    const parts = queue().encrypt(text).split('.');
    for (const index of [2, 3]) {
      const changed = [...parts];
      const bytes = Buffer.from(changed[index], 'base64');
      bytes[0] ^= 1;
      changed[index] = bytes.toString('base64');
      expect(() => queue().decrypt(changed.join('.'))).toThrow();
    }
  });

  it('binds protected secrets to their declared purpose', () => {
    const encrypted = queue().encrypt(
      'mfa-enrollment-secret',
      'identity-mfa-secret',
    );
    expect(queue().decrypt(encrypted, 'identity-mfa-secret')).toBe(
      'mfa-enrollment-secret',
    );
    expect(() => queue().decrypt(encrypted)).toThrow();
    expect(() => queue().decrypt(encrypted, 'email-delivery')).toThrow();
    expect(() =>
      queue().decrypt(queue().encrypt(text), 'identity-mfa-secret'),
    ).toThrow();
  });

  it('rejects decryption with a different key and invalid envelope versions', () => {
    const encrypted = queue().encrypt(text);
    expect(() => queue('b2'.repeat(32)).decrypt(encrypted)).toThrow();
    expect(() => queue().decrypt(encrypted.replace('v1.', 'v2.'))).toThrow();
    expect(() => queue().decrypt('v1.incomplete')).toThrow();
  });

  it('fails closed without an encryption key in production', () => {
    const production = new MailQueueService(
      new ConfigService({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'known-fixture-secret-with-more-than-32-characters',
      }),
    );
    expect(() => production.encrypt(text)).toThrow(
      'DELIVERY_ENCRYPTION_KEY is required',
    );
  });

  it('keeps the development fallback deterministic for queued content across process restarts', () => {
    const config = {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'known-fixture-secret-with-more-than-32-characters',
    };
    const saved = new MailQueueService(new ConfigService(config)).encrypt(text);
    expect(new MailQueueService(new ConfigService(config)).decrypt(saved)).toBe(
      text,
    );
  });
});
