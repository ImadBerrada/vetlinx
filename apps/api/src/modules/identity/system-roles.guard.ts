import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SystemRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../platform/persistence/prisma.service';
import type { AuthenticatedRequest } from './access-token.guard';
import { REQUIRED_ROLES_KEY } from './required-roles.decorator';
import { ConfigService } from '@nestjs/config';
import { MFA_RECENCY_MS } from '../identity-security/mfa.service';

@Injectable()
export class SystemRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SystemRole[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const assignments = await this.prisma.accountSystemRole.findMany({
      where: { accountId: request.user.accountId },
      select: { role: true },
    });
    const roles = assignments.map(({ role }) => role);
    request.user.roles = roles;
    if (
      roles.includes('PLATFORM_ADMIN') ||
      required.some((role) => roles.includes(role))
    ) {
      if (
        this.config.get<string>('NODE_ENV') === 'production' &&
        required.some((role) =>
          ['REVIEWER', 'OPERATIONS_ADMIN', 'PLATFORM_ADMIN'].includes(role),
        )
      ) {
        if (!request.user.mfaEnabled)
          throw new ForbiddenException({
            code: 'MFA_ENROLLMENT_REQUIRED',
            message:
              'Set up two-step verification in Settings & security → Two-step verification before using trust operations.',
            action: '/settings/security/mfa',
          });
        if (
          !request.user.mfaAuthenticatedAt ||
          request.user.mfaAuthenticatedAt.getTime() <
            Date.now() - MFA_RECENCY_MS
        )
          throw new ForbiddenException({
            code: 'MFA_STEP_UP_REQUIRED',
            message:
              'Confirm your identity in Settings & security → Two-step verification with an authenticator or recovery code to continue.',
            action: '/settings/security/mfa',
          });
      }
      return true;
    }
    throw new ForbiddenException(
      'This action requires an authorized platform role',
    );
  }
}
