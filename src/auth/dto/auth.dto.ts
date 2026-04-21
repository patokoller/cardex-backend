import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNumberString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'ezequiel_palermo' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username: only lowercase letters, numbers, and underscores',
  })
  username: string;

  @ApiProperty({ example: 'S3cur3P@ss!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiPropertyOptional({ example: '+5491112345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Palermo' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  barrio?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ezequiel_palermo' })
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
