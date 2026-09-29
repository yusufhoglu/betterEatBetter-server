import type { AiExample, AiExampleSource, ClientAiSetting, DietitianAiSettings } from '../domain/aiAssistant';

export type SaveAiSettingsInput = Omit<DietitianAiSettings, 'updatedAt'>;

export interface CreateAiExampleInput {
  dietitianId: string;
  question: string;
  answer: string;
  source: AiExampleSource;
  sourceMessageId: string | null;
}

/** Persistence for the dietitian AI assistant: settings, example answers, per-client overrides. */
export interface AiAssistantRepositoryPort {
  /** null → the dietitian never saved settings (callers use `defaultAiSettings`). */
  getSettings(dietitianId: string): Promise<DietitianAiSettings | null>;
  saveSettings(settings: SaveAiSettingsInput): Promise<DietitianAiSettings>;

  /** Newest first. */
  listExamples(dietitianId: string): Promise<AiExample[]>;
  countExamples(dietitianId: string): Promise<number>;
  findExample(exampleId: string): Promise<AiExample | null>;
  createExample(input: CreateAiExampleInput): Promise<AiExample>;
  updateExample(exampleId: string, patch: { question?: string; answer?: string }): Promise<AiExample>;
  deleteExample(exampleId: string): Promise<void>;

  getClientSetting(linkId: string): Promise<ClientAiSetting | null>;
  saveClientSetting(setting: ClientAiSetting): Promise<ClientAiSetting>;
}
