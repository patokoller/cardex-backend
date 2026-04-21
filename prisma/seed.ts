import { PrismaClient, Rarity, Game } from '@prisma/client';

const prisma = new PrismaClient();

// Base Set card catalog — first 20 cards (seed the rest via CSV import)
const BASE_SET_CARDS = [
  { setCode: 'BASE-001', name: 'Alakazam',          rarity: 'holo_rare'  },
  { setCode: 'BASE-002', name: 'Blastoise',          rarity: 'holo_rare'  },
  { setCode: 'BASE-003', name: 'Chansey',            rarity: 'holo_rare'  },
  { setCode: 'BASE-004', name: 'Charizard',          rarity: 'ultra_rare' },
  { setCode: 'BASE-005', name: 'Clefairy',           rarity: 'holo_rare'  },
  { setCode: 'BASE-006', name: 'Gyarados',           rarity: 'holo_rare'  },
  { setCode: 'BASE-007', name: 'Hitmonchan',         rarity: 'holo_rare'  },
  { setCode: 'BASE-008', name: 'Machamp',            rarity: 'holo_rare'  },
  { setCode: 'BASE-009', name: 'Magneton',           rarity: 'holo_rare'  },
  { setCode: 'BASE-010', name: 'Mewtwo',             rarity: 'holo_rare'  },
  { setCode: 'BASE-011', name: 'Nidoking',           rarity: 'holo_rare'  },
  { setCode: 'BASE-012', name: 'Ninetales',          rarity: 'holo_rare'  },
  { setCode: 'BASE-013', name: 'Poliwrath',          rarity: 'holo_rare'  },
  { setCode: 'BASE-014', name: 'Raichu',             rarity: 'holo_rare'  },
  { setCode: 'BASE-015', name: 'Scyther',            rarity: 'holo_rare'  },
  { setCode: 'BASE-016', name: 'Clefable',           rarity: 'holo_rare'  },
  { setCode: 'BASE-017', name: 'Electrode',          rarity: 'holo_rare'  },
  { setCode: 'BASE-018', name: 'Flareon',            rarity: 'holo_rare'  },
  { setCode: 'BASE-019', name: 'Jolteon',            rarity: 'holo_rare'  },
  { setCode: 'BASE-020', name: 'Vaporeon',           rarity: 'holo_rare'  },
  // Commons & Uncommons (sample)
  { setCode: 'BASE-025', name: 'Pikachu',            rarity: 'common'     },
  { setCode: 'BASE-026', name: 'Raichu (Uncommon)',  rarity: 'uncommon'   },
  { setCode: 'BASE-058', name: 'Magmar',             rarity: 'uncommon'   },
  { setCode: 'BASE-067', name: 'Rattata',            rarity: 'common'     },
  { setCode: 'BASE-071', name: 'Gastly',             rarity: 'common'     },
  { setCode: 'BASE-074', name: 'Geodude',            rarity: 'common'     },
  { setCode: 'BASE-079', name: 'Slowpoke',           rarity: 'common'     },
  { setCode: 'BASE-082', name: 'Magnemite',          rarity: 'common'     },
  { setCode: 'BASE-098', name: 'Krabby',             rarity: 'common'     },
  { setCode: 'BASE-102', name: 'Exeggcute',          rarity: 'common'     },
] as const;

// Anchor 30 — initial power users seeded for cold-start
const ANCHOR_USERS = [
  { username: 'ezequiel_palermo', barrio: 'Palermo',  lat: -34.5814, lng: -58.4261 },
  { username: 'lucia_almagro',    barrio: 'Almagro',  lat: -34.6098, lng: -58.4283 },
  { username: 'martin_caballito', barrio: 'Caballito', lat: -34.6194, lng: -58.4613 },
  { username: 'sofia_belgrano',   barrio: 'Belgrano', lat: -34.5598, lng: -58.4574 },
  { username: 'juan_villa_crespo',barrio: 'Villa Crespo', lat: -34.5969, lng: -58.4458 },
];

async function main() {
  console.log('🌱 Seeding Cardex database…');

  // 1. Enable PostGIS and extensions (idempotent)
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "postgis"`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  // 2. Seed card catalog
  console.log('  📦 Seeding Base Set cards…');
  for (const card of BASE_SET_CARDS) {
    await prisma.card.upsert({
      where: { setCode_game: { setCode: card.setCode, game: Game.pokemon } },
      create: {
        setCode: card.setCode,
        name: card.name,
        rarity: card.rarity as Rarity,
        setName: 'Base Set',
        setTotal: 102,
        game: Game.pokemon,
        imageUrl: `https://assets.cardex.ar/pokemon/base/${card.setCode}.webp`,
      },
      update: {},
    });
  }
  console.log(`  ✅ ${BASE_SET_CARDS.length} cards seeded`);

  // 3. Seed Anchor 30 users
  console.log('  👥 Seeding Anchor 30 users…');
  const bcrypt = await import('bcrypt');

  for (const u of ANCHOR_USERS) {
    const passwordHash = await bcrypt.hash('Cardex2024!', 12);
    await prisma.user.upsert({
      where: { username: u.username },
      create: {
        username: u.username,
        passwordHash,
        barrio: u.barrio,
        latitude: u.lat,
        longitude: u.lng,
        repScore: 25,   // Give them starter rep
        repTier: 'rookie',
      },
      update: {},
    });
  }
  console.log(`  ✅ ${ANCHOR_USERS.length} anchor users seeded`);

  // 4. Seed sample price snapshots for top cards
  console.log('  💰 Seeding base price snapshots…');
  const samplePrices: Record<string, number> = {
    'BASE-004': 450000, // Charizard — ~450 ARS at seed time
    'BASE-002': 120000, // Blastoise
    'BASE-010': 85000,  // Mewtwo
    'BASE-025': 8000,   // Pikachu
    'BASE-001': 75000,  // Alakazam
  };

  for (const [setCode, priceArs] of Object.entries(samplePrices)) {
    const card = await prisma.card.findFirst({
      where: { setCode, game: Game.pokemon },
      select: { id: true },
    });
    if (!card) continue;

    await prisma.priceSnapshot.create({
      data: {
        cardId: card.id,
        priceArs,
        priceUsdt: priceArs / 1000, // assume 1000 ARS/USD at seed
        source: 'mercadolibre',
        confidence: 0.6,
        sampleCount: 5,
      },
    });
  }
  console.log('  ✅ Price snapshots seeded');

  console.log('');
  console.log('🃏 Cardex seed complete!');
  console.log('   Next steps:');
  console.log('   1. Import full 2,000+ card catalog from pokemontcg.io API');
  console.log('   2. Run price scraper against MercadoLibre Argentina');
  console.log('   3. Reach out to Anchor 30 collectors personally');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
