import { toIsoDate } from '../domain/dates';
import type { ClientBodyMeasurement, ClientDataPort, ClientDay } from '../ports/ClientDataPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

const MAX_RANGE_DAYS = 31;

/**
 * Dietitian reads of a client's logged data. Every method goes through
 * ClientAccessPolicy.assertCanRead (assigned dietitian + consent + audit).
 * Meal photos are an independent scope: without 'meal_photos' the meals come
 * back with every photo URL stripped.
 */
export class ReadClientData {
  constructor(
    private readonly clientData: ClientDataPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async getDays(actorId: string, clientId: string, from: Date, to: Date): Promise<ClientDay[]> {
    const link = await this.policy.assertCanRead(actorId, clientId, 'meals', 'GET /practice/clients/:clientId/meals');
    const includePhotos = link.consentScopes.includes('meal_photos');
    if (includePhotos) {
      this.policy.log(actorId, clientId, 'meal_photos', 'GET /practice/clients/:clientId/meals');
    }

    return Promise.all(dateRange(from, to).map((date) => this.clientData.getDay(clientId, date, includePhotos)));
  }

  async listBodyMeasurements(
    actorId: string,
    clientId: string,
    input: { metric?: string; limit?: number; cursor?: string },
  ): Promise<ClientBodyMeasurement[]> {
    await this.policy.assertCanRead(
      actorId,
      clientId,
      'body_measurements',
      'GET /practice/clients/:clientId/body-measurements',
    );
    return this.clientData.listBodyMeasurements(clientId, input);
  }

  async getWater(actorId: string, clientId: string, from: Date, to: Date): Promise<Array<{ date: string; amountMl: number }>> {
    await this.policy.assertCanRead(actorId, clientId, 'water', 'GET /practice/clients/:clientId/water');
    return Promise.all(dateRange(from, to).map((date) => this.clientData.getWaterForDay(clientId, date)));
  }
}

/** Inclusive list of UTC-midnight dates, newest first, capped at MAX_RANGE_DAYS. */
export function dateRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(`${toIsoDate(from)}T00:00:00.000Z`);
  for (
    let cursor = new Date(`${toIsoDate(to)}T00:00:00.000Z`);
    cursor >= start && days.length < MAX_RANGE_DAYS;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  ) {
    days.push(cursor);
  }
  return days;
}
