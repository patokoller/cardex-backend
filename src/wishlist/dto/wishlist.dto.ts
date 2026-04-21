// ─── dto ──────────────────────────────────────────────────────────────────────

import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddWishlistItemDto {
  @ApiProperty()
  @IsUUID()
  cardId: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority: number = 5;

  @ApiPropertyOptional({ description: 'Max cash (ARS) user will add to a trade for this card' })
  @IsOptional()
  @Type(() => Number)
  maxCashArs?: number;
}

export class UpdateWishlistItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  maxCashArs?: number;
}
