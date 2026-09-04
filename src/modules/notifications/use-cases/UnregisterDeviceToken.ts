import { ValidationError } from '../../../shared/errors/ValidationError';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';

/** Removes a device's push token (logout, or notifications turned off on-device). Idempotent. */
export class UnregisterDeviceToken {
  constructor(private readonly repository: DeviceTokenRepositoryPort) {}

  async execute(input: { token: string }): Promise<void> {
    const token = input.token.trim();
    if (!token) {
      throw new ValidationError('MISSING_DEVICE_TOKEN', 'token is required');
    }
    await this.repository.deleteByToken(token);
  }
}
