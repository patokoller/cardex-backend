import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ConditionEnum {
  nm = 'nm',
  lp = 'lp',
  mp = 'mp',
  hp = 'hp',
  damaged = 'damaged',
}

export class AddCardDto {
  @ApiProperty({ description: 'Set-code identifier e.g. BASE-001' })
  @IsString()
  setCode: string;

  @ApiPropertyOptional({ enum: ConditionEnum, default: 'nm' })
  @IsOptional()
  @IsEnum(ConditionEnum)
  condition: ConditionEnum = ConditionEnum.nm;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number = 1;
}

export class MarkForTradeDto {
  @ApiProperty({ description: 'Number of copies to mark as tradeable' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  forTrade: number;
}

export class CollectionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by set name prefix' })
  @IsOptional()
  @IsString()
  set?: string;

  @ApiPropertyOptional({ description: 'Show only cards marked for trade' })
  @IsOptional()
  @Type(() => Boolean)
  forTradeOnly?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  pageSize: number = 60;
}
