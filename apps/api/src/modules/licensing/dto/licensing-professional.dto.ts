import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PathwaySearchQueryDto {
  @IsOptional()
  @Transform(trimUpper)
  @Matches(/^[A-Z]{2}$/)
  jurisdictionCode?: string;

  @IsOptional()
  @Transform(trimUpper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  licenceTypeCode?: string;
}

export class LinkRequirementCredentialDto {
  @IsUUID()
  credentialId!: string;
}

export class UpdateRequirementProgressDto {
  @IsIn(['IN_PROGRESS'])
  state!: 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
