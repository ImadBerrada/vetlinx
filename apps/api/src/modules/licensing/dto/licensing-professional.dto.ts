import { Transform } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';

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
