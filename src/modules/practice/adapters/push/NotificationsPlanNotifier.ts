import { env } from '../../../../shared/config/env';
import { prisma } from '../../../../shared/persistence/db';
import { FcmPushAdapter } from '../../../notifications/adapters/push/FcmPushAdapter';
import { PrismaDeviceTokenRepository } from '../../../notifications/adapters/repository/PrismaDeviceTokenRepository';
import { SendPushToUser } from '../../../notifications/use-cases/SendPushToUser';
import type { PlanNotifierPort } from '../../ports/PlanNotifierPort';

/** Push via the notifications module's delivery path (device tokens + FCM). */
export class NotificationsPlanNotifier implements PlanNotifierPort {
  private readonly sender = new SendPushToUser(new PrismaDeviceTokenRepository(prisma), new FcmPushAdapter());

  async notifyPlanUpdated(clientId: string): Promise<void> {
    if (!env.NOTIFICATIONS_ENABLED) {
      return;
    }
    await this.sender.execute({
      userId: clientId,
      title: 'Beslenme planın güncellendi',
      body: 'Diyetisyenin sana yeni bir beslenme planı paylaştı.',
      data: { type: 'meal_plan' },
    });
  }
}
