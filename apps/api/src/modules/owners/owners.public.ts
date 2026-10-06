export const OWNERS_PUBLIC_API = Symbol('OWNERS_PUBLIC_API');

export interface OwnersPublicApi {
  findPetForBooking(
    accountId: string,
    petId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    id: string;
    name: string;
    speciesCode: string;
    ownerProfileId: string;
    ownerName: string;
    contactPhone: string;
  } | null>;
}
import type { Prisma } from '../../generated/prisma/client';
