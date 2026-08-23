import { SetMetadata } from '@nestjs/common';
import type { SystemRole } from '../../generated/prisma/enums';

export const REQUIRED_ROLES_KEY = 'vetlinx.required-system-roles';

export const RequireSystemRoles = (...roles: SystemRole[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
