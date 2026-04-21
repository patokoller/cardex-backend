import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum GameFilter {
  pokemon = 'pokemon',
  dragon_ball = 'dragon_ball',
  one_piece = 'one_piece',
}

export enum RarityFilter {
  common = 'common',
  uncommon = 'uncommon',
  holo_rare = 'holo_rare',
  ultra_rare = 'ultra_rare',
  secret_rare = 'secret_rare',
}

export class CardSearchDto {
  @ApiPropertyOptional({ description: 'Full-text search on card name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: GameFilter })
  @IsOptional()
  @IsEnum(GameFilter)
  game?: GameFilter;

  @ApiPropertyOptional({ enum: RarityFilter })
  @IsOptional()
  @IsEnum(RarityFilter)
  rarity?: RarityFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  setCode?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
