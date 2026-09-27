import type { IsManagedClient } from '../../../practice/use-cases/IsManagedClient';
import type { ManagedClientPort } from '../../ports/ManagedClientPort';

export class PracticeManagedClientAdapter implements ManagedClientPort {
  constructor(private readonly isManagedClientUseCase: IsManagedClient) {}

  isManagedClient(userId: string): Promise<boolean> {
    return this.isManagedClientUseCase.execute(userId);
  }
}
