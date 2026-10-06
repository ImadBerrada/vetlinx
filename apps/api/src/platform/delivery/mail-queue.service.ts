import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';

export interface QueuedEmail {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  sensitive: boolean;
  expiresAt?: Date;
}

@Injectable()
export class MailQueueService {
  constructor(private readonly config: ConfigService) {}

  private key() {
    const configured = this.config.get<string>('DELIVERY_ENCRYPTION_KEY');
    if (configured) return Buffer.from(configured, 'hex');
    if (this.config.get<string>('NODE_ENV') === 'production')
      throw new Error('DELIVERY_ENCRYPTION_KEY is required');
    return createHash('sha256')
      .update(
        `vetlinx-development-delivery:${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}`,
      )
      .digest();
  }

  encrypt(text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(value: string) {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || ciphertext === undefined)
      throw new Error('Invalid encrypted delivery');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async enqueue(
    transaction: Prisma.TransactionClient,
    message: QueuedEmail,
  ): Promise<void> {
    await transaction.emailDelivery.createMany({
      data: [
        {
          idempotencyKey: message.idempotencyKey,
          to: message.to,
          subject: message.subject,
          encryptedText: this.encrypt(message.text),
          sensitive: message.sensitive,
          expiresAt: message.expiresAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}
