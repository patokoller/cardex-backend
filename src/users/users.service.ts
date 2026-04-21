import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterPushDeviceDto,
  UpdateLocationDto,
  UpdateWhatsappDto,
} from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public profile (no auth) ───────────────────────────────────────────────

  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        barrio: true,
        repScore: true,
        repTier: true,
        createdAt: true,
        collectionItems: {
          take: 3,
          orderBy: { updatedAt: 'desc' },
          include: {
            card: {
              select: {
                name: true,
                rarity: true,
                setName: true,
                imageUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            initiatedTrades: true,
            collectionItems: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException(`User @${username} not found`);

    return {
      username: user.username,
      barrio: user.barrio,
      repScore: user.repScore,
      repTier: user.repTier,
      memberSince: user.createdAt,
      stats: {
        cards: user._count.collectionItems,
        trades: user._count.initiatedTrades,
      },
      topCards: user.collectionItems.map((ci: any) => ({
        name: ci.card.name,
        rarity: ci.card.rarity,
        setName: ci.card.setName,
        imageUrl: ci.card.imageUrl,
      })),
    };
  }

  // ── Private profile ────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        barrio: true,
        latitude: true,
        longitude: true,
        repScore: true,
        repTier: true,
        whatsappOptIn: true,
        idCardSent: true,
        firstTradeGuaranteeUsed: true,
        createdAt: true,
        _count: {
          select: {
            collectionItems: true,
            wishlistItems: true,
            initiatedTrades: true,
          },
        },
      },
    });

    return user;
  }

  // ── Location ───────────────────────────────────────────────────────────────

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        barrio: dto.barrio,
      },
      select: { id: true, latitude: true, longitude: true, barrio: true },
    });
  }

  // ── Push devices ───────────────────────────────────────────────────────────

  async registerPushDevice(userId: string, dto: RegisterPushDeviceDto) {
    return this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform },
    });
  }

  async removePushDevice(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({
      where: { userId, token },
    });
  }

  // ── WhatsApp opt-in ────────────────────────────────────────────────────────

  async updateWhatsappOptIn(userId: string, dto: UpdateWhatsappDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { whatsappOptIn: dto.optIn },
      select: { id: true, whatsappOptIn: true },
    });
  }

  // ── Rep history ────────────────────────────────────────────────────────────

  async getRepHistory(userId: string) {
    const events = await this.prisma.repEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalScore = events.reduce((sum: number, e: any) => sum + e.delta, 0);
    return { totalScore, events };
  }

  // ── Social graph (Conocido de conocido) ───────────────────────────────────

  async getSharedConnections(userAId: string, userBId: string) {
    // Collectors who have traded with BOTH userA and userB
    const shared: { shared_user_id: string }[] = await this.prisma.$queryRaw`
      SELECT DISTINCT uc1.user_b_id AS shared_user_id
      FROM user_connections uc1
      JOIN user_connections uc2 ON uc2.user_b_id = uc1.user_b_id
      WHERE uc1.user_a_id = ${userAId}::uuid
        AND uc2.user_a_id = ${userBId}::uuid
      LIMIT 5
    `;

    return shared.map((r) => r.shared_user_id);
  }
}
