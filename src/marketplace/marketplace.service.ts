// marketplace.service.ts
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Marketplace — cash buy/sell layer.
 *
 * INTENTIONALLY THIN IN MVP.
 * This module must not be activated until:
 *   - P2P trade graph proves itself (50+ completed trades)
 *   - Legal memo clears ARS payment compliance
 *   - Pricing oracle has 500+ internal trades
 *
 * The controller guards every endpoint behind the MVP gate.
 * Engineers: add real listing logic here at Month 4.
 */
@Injectable()
export class MarketplaceService {
  private readonly MVP_GATE = true; // Flip to false at Month 4

  constructor(private readonly prisma: PrismaService) {}

  assertNotMvp() {
    if (this.MVP_GATE) {
      throw new ServiceUnavailableException({
        message:
          'El marketplace está en construcción. Por ahora, usá el intercambio P2P.',
        code: 'MARKETPLACE_NOT_LIVE',
        availableAt: 'Month 4 — after 50+ completed P2P trades',
      });
    }
  }

  async getListings(cardId?: string) {
    this.assertNotMvp();
    // Month 4: query listings table with price oracle context
    return [];
  }

  async createListing(_userId: string, _dto: unknown) {
    this.assertNotMvp();
  }

  async purchaseListing(_buyerId: string, _listingId: string) {
    this.assertNotMvp();
    // Month 4: Mercado Pago escrow flow
    // 1. Buyer pays → MP hold
    // 2. Seller ships
    // 3. Both confirm → MP release
    // 4. Cardex takes 4% on release
    // 5. Convert ARS fee → USDT via Ripio
  }
}
