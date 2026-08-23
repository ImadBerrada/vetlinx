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

@Injectable()
export class SystemRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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
      return true;
    }
    throw new ForbiddenException(
      'This action requires an authorized platform role',
    );
  }
}
