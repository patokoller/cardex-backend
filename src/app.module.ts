import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CardsModule } from './cards/cards.module';
import { CollectionModule } from './collection/collection.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { TradesModule } from './trades/trades.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PricingModule } from './pricing/pricing.module';
import { TrustModule } from './trust/trust.module';
import { NotificationsModule } from './notifications/notifications.module';
import { validate } from './common/config/env.validation';

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Rate limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
          },
        ],
      }),
    }),

    // ── Core infra ───────────────────────────────────────────────────────────
    PrismaModule,

    // ── Feature modules ──────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CardsModule,
    CollectionModule,
    WishlistModule,
    TradesModule,
    MarketplaceModule,
    PricingModule,
    TrustModule,
    NotificationsModule,
  ],
  providers: [
    // Apply rate limiter globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
