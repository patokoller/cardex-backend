import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: -34.6037 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -58.3816 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 'Palermo' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  barrio?: string;
}

export class RegisterPushDeviceDto {
  @ApiPropertyOptional()
  @IsString()
  token: string;

  @ApiPropertyOptional({ enum: ['ios', 'android'] })
  @IsString()
  platform: 'ios' | 'android';
}

export class UpdateWhatsappDto {
  @IsBoolean()
  optIn: boolean;
}
