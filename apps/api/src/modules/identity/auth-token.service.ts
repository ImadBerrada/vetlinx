import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedAccount } from './identity.types';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(account: AuthenticatedAccount): Promise<string> {
    return this.jwt.signAsync(
      { sub: account.accountId, email: account.email, typ: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTokenTtlSeconds,
        issuer: 'vetlinx-api',
        audience: 'vetlinx-clients',
      },
    );
  }

  generateRefreshToken(): {
    token: string;
    hash: string;
    expiresAt: Date;
  } {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() +
        this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS'),
    );
    return { token, hash: this.hashRefreshToken(token), expiresAt };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  get accessTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
  }
}
