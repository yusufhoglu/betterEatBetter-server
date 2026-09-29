import { ConflictError } from '../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import {
  AI_LIMITS,
  assistantDisplayName,
  buildAssistantPersona,
  defaultAiSettings,
  isValidTime,
  isValidTimeZone,
  isWithinSchedule,
  nextScheduleOpening,
  type AiExample,
  type AiSchedule,
  type DietitianAiSettings,
} from '../domain/aiAssistant';
import type { AiAssistantRepositoryPort, SaveAiSettingsInput } from '../ports/AiAssistantRepositoryPort';
import type { AiTranscriptPort } from '../ports/AiTranscriptPort';
import type { AssistantPreviewPort, PreviewMessage } from '../ports/AssistantPreviewPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

export type AiSettingsInput = Omit<SaveAiSettingsInput, 'dietitianId'>;

export interface AiSettingsView extends DietitianAiSettings {
  /** What clients see as the assistant's name. */
  displayName: string;
  availableNow: boolean;
  nextAvailableAt: Date | null;
  exampleCount: number;
}

/**
 * The dietitian's own assistant configuration: persona, rules, schedule,
 * example answers and a preview chat. Every method requires the caller to be
 * a dietitian; examples are private to their author.
 */
export class AiAssistantSettings {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly aiRepository: AiAssistantRepositoryPort,
    private readonly transcripts: AiTranscriptPort,
    private readonly preview: AssistantPreviewPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(dietitianId: string): Promise<AiSettingsView> {
    await this.requireDietitian(dietitianId);
    const [settings, exampleCount, name] = await Promise.all([
      this.aiRepository.getSettings(dietitianId),
      this.aiRepository.countExamples(dietitianId),
      this.dietitianName(dietitianId),
    ]);
    return this.view(settings ?? defaultAiSettings(dietitianId), exampleCount, name);
  }

  async update(dietitianId: string, input: AiSettingsInput): Promise<AiSettingsView> {
    await this.requireDietitian(dietitianId);
    validateSchedule(input.schedule);
    const saved = await this.aiRepository.saveSettings({
      ...input,
      dietitianId,
      rules: cleanList(input.rules),
      avoid: cleanList(input.avoid),
    });
    const [exampleCount, name] = await Promise.all([
      this.aiRepository.countExamples(dietitianId),
      this.dietitianName(dietitianId),
    ]);
    return this.view(saved, exampleCount, name);
  }

  /** Answers as the assistant would, from the saved settings — no client data, nothing stored. */
  async previewReply(dietitianId: string, messages: PreviewMessage[]): Promise<{ reply: string }> {
    await this.requireDietitian(dietitianId);
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') {
      throw new ValidationError('PREVIEW_NEEDS_USER_MESSAGE', 'The last preview message must be from the user');
    }
    const [settings, examples, name] = await Promise.all([
      this.aiRepository.getSettings(dietitianId),
      this.aiRepository.listExamples(dietitianId),
      this.dietitianName(dietitianId),
    ]);
    const persona = buildAssistantPersona({
      settings: settings ?? defaultAiSettings(dietitianId),
      dietitianName: name,
      examples,
      message: last.content,
      clientInstructions: null,
    });
    return { reply: await this.preview.reply(persona, messages) };
  }

  listExamples(dietitianId: string): Promise<AiExample[]> {
    return this.requireDietitian(dietitianId).then(() => this.aiRepository.listExamples(dietitianId));
  }

  /**
   * `sourceMessageId` = the dietitian is correcting a real assistant reply
   * from a client chat; it must be a reply produced for this dietitian.
   */
  async createExample(
    dietitianId: string,
    input: { question: string; answer: string; sourceMessageId?: string | null },
  ): Promise<AiExample> {
    await this.requireDietitian(dietitianId);
    if ((await this.aiRepository.countExamples(dietitianId)) >= AI_LIMITS.maxExamples) {
      throw new ConflictError('AI_EXAMPLE_LIMIT', `At most ${AI_LIMITS.maxExamples} examples`);
    }
    const sourceMessageId = input.sourceMessageId ?? null;
    if (sourceMessageId && !(await this.transcripts.findAssistantMessage(sourceMessageId, dietitianId))) {
      throw new NotFoundError('AI_MESSAGE_NOT_FOUND', 'Assistant message not found');
    }
    return this.aiRepository.createExample({
      dietitianId,
      question: input.question,
      answer: input.answer,
      source: sourceMessageId ? 'correction' : 'manual',
      sourceMessageId,
    });
  }

  async updateExample(
    dietitianId: string,
    exampleId: string,
    patch: { question?: string; answer?: string },
  ): Promise<AiExample> {
    await this.requireOwnExample(dietitianId, exampleId);
    return this.aiRepository.updateExample(exampleId, patch);
  }

  async deleteExample(dietitianId: string, exampleId: string): Promise<void> {
    await this.requireOwnExample(dietitianId, exampleId);
    await this.aiRepository.deleteExample(exampleId);
  }

  private view(settings: DietitianAiSettings, exampleCount: number, dietitianName: string | null): AiSettingsView {
    const now = this.now();
    const availableNow = settings.enabled && isWithinSchedule(settings.schedule, now);
    return {
      ...settings,
      displayName: assistantDisplayName(settings, dietitianName),
      availableNow,
      nextAvailableAt: !settings.enabled || availableNow ? null : nextScheduleOpening(settings.schedule, now),
      exampleCount,
    };
  }

  private async dietitianName(dietitianId: string): Promise<string | null> {
    return (await this.repository.getPeople([dietitianId])).get(dietitianId)?.name ?? null;
  }

  private async requireOwnExample(dietitianId: string, exampleId: string): Promise<void> {
    await this.requireDietitian(dietitianId);
    const example = await this.aiRepository.findExample(exampleId);
    // Someone else's example is indistinguishable from a missing one.
    if (!example || example.dietitianId !== dietitianId) {
      throw new NotFoundError('AI_EXAMPLE_NOT_FOUND', 'Example not found');
    }
  }

  private async requireDietitian(userId: string): Promise<void> {
    if (!(await this.repository.findDietitianProfile(userId))) {
      throw new NotFoundError('NOT_A_DIETITIAN', 'This account is not a dietitian');
    }
  }
}

function cleanList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function validateSchedule(schedule: AiSchedule | null): void {
  if (!schedule) {
    return;
  }
  if (!isValidTimeZone(schedule.timeZone)) {
    throw new ValidationError('INVALID_TIME_ZONE', `Unknown time zone ${schedule.timeZone}`);
  }
  for (const window of schedule.windows) {
    if (!isValidTime(window.start) || !isValidTime(window.end)) {
      throw new ValidationError('INVALID_SCHEDULE_TIME', 'Times must be HH:MM (00:00–23:59)');
    }
    const days = new Set(window.days);
    if (days.size === 0 || days.size !== window.days.length || [...days].some((d) => d < 1 || d > 7)) {
      throw new ValidationError('INVALID_SCHEDULE_DAYS', 'Days must be distinct ISO weekdays 1 (Mon) – 7 (Sun)');
    }
  }
}
