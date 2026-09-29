import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { AiExample, ClientAiSetting, DietitianAiSettings } from '../../domain/aiAssistant';
import type {
  AiAssistantRepositoryPort,
  CreateAiExampleInput,
  SaveAiSettingsInput,
} from '../../ports/AiAssistantRepositoryPort';

export class InMemoryAiAssistantRepository implements AiAssistantRepositoryPort {
  readonly settings = new Map<string, DietitianAiSettings>();
  readonly examples: AiExample[] = [];
  readonly clientSettings = new Map<string, ClientAiSetting>();
  private clock = 0;

  async getSettings(dietitianId: string): Promise<DietitianAiSettings | null> {
    return this.settings.get(dietitianId) ?? null;
  }

  async saveSettings(settings: SaveAiSettingsInput): Promise<DietitianAiSettings> {
    const saved = { ...settings, updatedAt: new Date() };
    this.settings.set(settings.dietitianId, saved);
    return saved;
  }

  async listExamples(dietitianId: string): Promise<AiExample[]> {
    return this.examples
      .filter((e) => e.dietitianId === dietitianId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async countExamples(dietitianId: string): Promise<number> {
    return this.examples.filter((e) => e.dietitianId === dietitianId).length;
  }

  async findExample(exampleId: string): Promise<AiExample | null> {
    return this.examples.find((e) => e.id === exampleId) ?? null;
  }

  async createExample(input: CreateAiExampleInput): Promise<AiExample> {
    // Strictly increasing timestamps keep "newest first" deterministic in tests.
    const createdAt = new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000);
    const example: AiExample = { id: randomUUID(), ...input, createdAt, updatedAt: createdAt };
    this.examples.push(example);
    return example;
  }

  async updateExample(exampleId: string, patch: { question?: string; answer?: string }): Promise<AiExample> {
    const example = this.examples.find((e) => e.id === exampleId);
    if (!example) {
      throw new NotFoundError('AI_EXAMPLE_NOT_FOUND', 'Example not found');
    }
    Object.assign(example, patch, { updatedAt: new Date() });
    return example;
  }

  async deleteExample(exampleId: string): Promise<void> {
    const index = this.examples.findIndex((e) => e.id === exampleId);
    if (index >= 0) {
      this.examples.splice(index, 1);
    }
  }

  async getClientSetting(linkId: string): Promise<ClientAiSetting | null> {
    return this.clientSettings.get(linkId) ?? null;
  }

  async saveClientSetting(setting: ClientAiSetting): Promise<ClientAiSetting> {
    this.clientSettings.set(setting.linkId, { ...setting });
    return setting;
  }
}
