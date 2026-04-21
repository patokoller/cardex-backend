import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ConditionEnum {
  nm = 'nm',
  lp = 'lp',
  mp = 'mp',
  hp = 'hp',
  damaged = 'damaged',
}

export class TradeCardItemDto {
  @ApiProperty()
  @IsUUID()
  cardId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number = 1;

  @ApiPropertyOptional({ enum: ConditionEnum, default: 'nm' })
  @IsOptional()
  @IsEnum(ConditionEnum)
  condition: ConditionEnum = ConditionEnum.nm;
}

export class CreateOfferDto {
  @ApiProperty({ description: 'UUID of the user to trade with' })
  @IsUUID()
  counterpartId: string;

  @ApiProperty({ type: [TradeCardItemDto], description: 'Cards you are offering' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TradeCardItemDto)
  offeredCards: TradeCardItemDto[];

  @ApiProperty({ type: [TradeCardItemDto], description: 'Cards you want in return' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TradeCardItemDto)
  requestedCards: TradeCardItemDto[];

  @ApiPropertyOptional({
    description: 'Cash delta in ARS (+ve = you pay, -ve = you receive)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  cashDeltaArs: number = 0;
}

export class CounterOfferDto {
  @ApiProperty({ type: [TradeCardItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TradeCardItemDto)
  offeredCards: TradeCardItemDto[];

  @ApiProperty({ type: [TradeCardItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TradeCardItemDto)
  requestedCards: TradeCardItemDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  cashDeltaArs: number = 0;
}

export class ConfirmTradeDto {
  @ApiProperty({ enum: ['in_person', 'shipped'] })
  @IsEnum(['in_person', 'shipped'])
  tradeType: 'in_person' | 'shipped';

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
