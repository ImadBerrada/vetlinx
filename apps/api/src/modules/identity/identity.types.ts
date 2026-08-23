import type { SystemRole } from '../../generated/prisma/enums';

export interface AuthenticatedAccount {
  accountId: string;
  email: string;
  roles?: SystemRole[];
}

export interface RequestMetadata {
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticationResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  account: {
    id: string;
    email: string;
    status: string;
    roles: SystemRole[];
  };
}
