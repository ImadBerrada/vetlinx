import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedAccount } from './identity.types';
import { PrismaService } from '../../platform/persistence/prisma.service';

export type AuthenticatedRequest = Request & { user: AuthenticatedAccount };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: {
      sub: string;
      email: string;
      typ: string;
      av?: number;
      sid?: string;
    };
    try {
      payload = await this.jwt.verifyAsync<typeof payload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: 'vetlinx-api',
        audience: 'vetlinx-clients',
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'access' || !payload.sub || !payload.email)
      throw new UnauthorizedException();
    // Unbound legacy access tokens must rotate before using protected APIs.
    if (
      typeof payload.sid !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.sid,
      )
    )
      throw new UnauthorizedException();
    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      select: { status: true, authVersion: true },
    });
    if (account?.status !== 'ACTIVE') throw new UnauthorizedException();
    // Legacy tokens carry version zero until they rotate. A reset/revoke-all invalidates them.
    if ((payload.av ?? 0) !== account.authVersion)
      throw new UnauthorizedException();
    if (
      payload.sid &&
      !(await this.prisma.refreshSession.findFirst({
        where: {
          accountId: payload.sub,
          familyId: payload.sid,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }))
    )
      throw new UnauthorizedException();
    request.user = {
      accountId: payload.sub,
      email: payload.email,
      authVersion: account.authVersion,
      sessionFamilyId: payload.sid,
    };
    return true;
  }
}
