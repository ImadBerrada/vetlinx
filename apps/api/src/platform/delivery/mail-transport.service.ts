import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

@Injectable()
export class MailTransportService {
  constructor(private readonly config: ConfigService) {}

  async send(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
  }) {
    const mode = this.config.get<string>('MAIL_TRANSPORT', 'capture');
    if (mode === 'capture') {
      if (this.config.get<string>('NODE_ENV') === 'production')
        throw new Error('Capture transport is development only');
      const directory = resolve(
        this.config.get<string>('MAIL_CAPTURE_PATH', './var/mail'),
      );
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(directory, `${message.id}.json`),
        JSON.stringify({ ...message, capturedAt: new Date().toISOString() }),
        { mode: 0o600 },
      );
      return;
    }
    if (mode !== 'smtp') throw new Error('Email transport unavailable');
    const transport = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      requireTLS: this.config.get<string>('NODE_ENV') === 'production',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.getOrThrow<string>('SMTP_USER'),
            pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result: unknown = await transport.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: message.to,
        subject: message.subject,
        text: message.text,
        messageId: `<${message.id}@vetlinx.delivery>`,
      });
      if (
        typeof result !== 'object' ||
        result === null ||
        !('accepted' in result) ||
        !Array.isArray(result.accepted) ||
        result.accepted.length !== 1
      )
        throw new Error('Recipient was not accepted');
    } finally {
      transport.close();
    }
  }
}
