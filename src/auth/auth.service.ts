import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<TokenPair> {
    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });

    if (exists) {
      throw new ConflictException(`Username "${dto.username}" is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const phoneHash = dto.phone
      ? createHash('sha256').update(dto.phone.replace(/\D/g, '')).digest('hex')
      : undefined;

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        phoneHash,
        barrio: dto.barrio,
      },
    });

    return this.issueTokenPair(user.id, user.username, user.repTier);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        repTier: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id, user.username, user.repTier);
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(userId: string, rawRefreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        repTier: true,
        refreshTokenHash: true,
      },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session expired — please log in again');
    }

    const tokenMatch = await bcrypt.compare(
      rawRefreshToken,
      user.refreshTokenHash,
    );

    if (!tokenMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(user.id, user.username, user.repTier);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async issueTokenPair(
    userId: string,
    username: string,
    tier: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, username, tier };

    const accessExpiresIn = this.config.get('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN', '30d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    // Store hashed refresh token — never store raw tokens
    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
