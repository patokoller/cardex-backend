import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Get user notifications ────────────────────────────────────────────────

  async getNotifications(userId: string, unreadOnly = false) {
    const items = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { items, unreadCount };
  }

  // ── Mark as read ───────────────────────────────────────────────────────────

  async markRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // ── Send trade notification ────────────────────────────────────────────────

  async sendTradeNotification(
    recipientId: string,
    type: string,
    offer: {
      id: string;
      initiator?: { username: string };
      counterpart?: { username: string };
    },
  ) {
    const templates: Record<string, { title: string; body: string }> = {
      trade_offer_received: {
        title: '¡Nueva oferta de intercambio!',
        body: `${offer.initiator?.username ?? 'Alguien'} te ofrece un intercambio — expira en 2h`,
      },
      trade_countered: {
        title: 'Contraoferta recibida',
        body: `${offer.initiator?.username ?? 'Alguien'} respondió con una contraoferta`,
      },
      trade_accepted: {
        title: '¡Oferta aceptada!',
        body: 'Tu oferta fue aceptada. Coordiná el intercambio.',
      },
      trade_confirmed: {
        title: 'Intercambio confirmado',
        body: 'Una parte confirmó el intercambio. Esperando la otra confirmación.',
      },
      trade_completed: {
        title: '¡Intercambio completado! +25 rep',
        body: 'El intercambio fue exitoso. Tu reputación creció.',
      },
      trade_expired: {
        title: 'Oferta expirada',
        body: 'Una oferta de intercambio expiró sin respuesta.',
      },
    };

    const template = templates[type] ?? {
      title: 'Notificación',
      body: 'Tenés una actualización en Cardex',
    };

    // Store in DB
    const notification = await this.prisma.notification.create({
      data: {
        userId: recipientId,
        type: type as any,
        title: template.title,
        body: template.body,
        data: { offerId: offer.id },
      },
    });

    // Send push notification via FCM/APNs
    await this.sendPush(recipientId, template.title, template.body, {
      offerId: offer.id,
      type,
    });

    return notification;
  }

  // ── Push notification dispatch ─────────────────────────────────────────────
  // MVP: logs intent. Production: integrate Expo Push / FCM / APNs SDK here.

  private async sendPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });

    if (!devices.length) return;

    // In production, replace with Expo Push Notification API call:
    // POST https://exp.host/--/api/v2/push/send
    // { to: token, title, body, data, sound: 'default', badge: 1 }

    this.logger.debug(
      `Push → ${devices.length} device(s) for user ${userId}: "${title}"`,
    );

    // For each device, you would call the platform SDK:
    // iOS:     APNs via node-apn or @parse/node-apn
    // Android: FCM via firebase-admin
    // Cross:   Expo Push SDK (handles both)
    for (const device of devices) {
      this.logger.debug(
        `  [${device.platform}] token=${device.token.slice(0, 20)}…`,
      );
    }
  }

  // ── Price alert (curator-sent in MVP, automated later) ────────────────────

  async sendPriceAlert(
    userId: string,
    cardName: string,
    newPriceArs: number,
    cardId: string,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type: 'price_alert' as any,
        title: `📈 ${cardName} cambió de precio`,
        body: `Precio actualizado: $${newPriceArs.toLocaleString('es-AR')} ARS`,
        data: { cardId, newPriceArs },
      },
    });
  }
}
