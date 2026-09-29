import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createModuleLogger } from '../../../../shared/observability/logger';
import {
  AI_ADDRESS_FORMS,
  type AiExample,
  type AiSchedule,
  type ClientAiSetting,
  type DietitianAiSettings,
} from '../../domain/aiAssistant';
import type {
  AiAssistantRepositoryPort,
  CreateAiExampleInput,
  SaveAiSettingsInput,
} from '../../ports/AiAssistantRepositoryPort';

const logger = createModuleLogger('practice');

type SettingsRow = Prisma.DietitianAiSettingsGetPayload<object>;
type ExampleRow = Prisma.DietitianAiExampleGetPayload<object>;

const scheduleSchema = z.object({
  timeZone: z.string().min(1),
  windows: z.array(z.object({ days: z.array(z.number().int()), start: z.string(), end: z.string() })),
});

/**
 * A malformed stored schedule must not silently mean "always on" — the
 * dietitian chose to limit the hours. Treat it as closed until re-saved.
 */
function parseSchedule(value: Prisma.JsonValue | null, dietitianId: string): AiSchedule | null {
  if (value === null) {
    return null;
  }
  const parsed = scheduleSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn({ dietitianId }, 'stored AI assistant schedule is malformed; treating it as closed');
    return { timeZone: 'UTC', windows: [] };
  }
  return parsed.data;
}

function toSettings(row: SettingsRow): DietitianAiSettings {
  const addressForm = (AI_ADDRESS_FORMS as readonly string[]).includes(row.addressForm ?? '')
    ? (row.addressForm as DietitianAiSettings['addressForm'])
    : null;
  return {
    dietitianId: row.dietitianId,
    enabled: row.enabled,
    defaultClientAccess: row.defaultClientAccess,
    assistantName: row.assistantName,
    addressForm,
    tone: row.tone,
    approach: row.approach,
    rules: row.rules,
    avoid: row.avoid,
    handoffMessage: row.handoffMessage,
    schedule: parseSchedule(row.schedule, row.dietitianId),
    updatedAt: row.updatedAt,
  };
}

function toExample(row: ExampleRow): AiExample {
  return {
    id: row.id,
    dietitianId: row.dietitianId,
    question: row.question,
    answer: row.answer,
    source: row.source === 'correction' ? 'correction' : 'manual',
    sourceMessageId: row.sourceMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaAiAssistantRepository implements AiAssistantRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async getSettings(dietitianId: string): Promise<DietitianAiSettings | null> {
    const row = await this.db.dietitianAiSettings.findUnique({ where: { dietitianId } });
    return row ? toSettings(row) : null;
  }

  async saveSettings(settings: SaveAiSettingsInput): Promise<DietitianAiSettings> {
    const { dietitianId, schedule, ...rest } = settings;
    const data = {
      ...rest,
      schedule: schedule === null ? Prisma.DbNull : (schedule as unknown as Prisma.InputJsonValue),
    };
    const row = await this.db.dietitianAiSettings.upsert({
      where: { dietitianId },
      create: { dietitianId, ...data },
      update: data,
    });
    return toSettings(row);
  }

  async listExamples(dietitianId: string): Promise<AiExample[]> {
    const rows = await this.db.dietitianAiExample.findMany({
      where: { dietitianId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toExample);
  }

  countExamples(dietitianId: string): Promise<number> {
    return this.db.dietitianAiExample.count({ where: { dietitianId } });
  }

  async findExample(exampleId: string): Promise<AiExample | null> {
    const row = await this.db.dietitianAiExample.findUnique({ where: { id: exampleId } });
    return row ? toExample(row) : null;
  }

  async createExample(input: CreateAiExampleInput): Promise<AiExample> {
    return toExample(await this.db.dietitianAiExample.create({ data: input }));
  }

  async updateExample(exampleId: string, patch: { question?: string; answer?: string }): Promise<AiExample> {
    return toExample(await this.db.dietitianAiExample.update({ where: { id: exampleId }, data: patch }));
  }

  async deleteExample(exampleId: string): Promise<void> {
    await this.db.dietitianAiExample.deleteMany({ where: { id: exampleId } });
  }

  async getClientSetting(linkId: string): Promise<ClientAiSetting | null> {
    const row = await this.db.clientAiSetting.findUnique({ where: { linkId } });
    return row ? { linkId: row.linkId, access: toAccess(row.access), instructions: row.instructions } : null;
  }

  async saveClientSetting(setting: ClientAiSetting): Promise<ClientAiSetting> {
    const data = { access: setting.access, instructions: setting.instructions };
    const row = await this.db.clientAiSetting.upsert({
      where: { linkId: setting.linkId },
      create: { linkId: setting.linkId, ...data },
      update: data,
    });
    return { linkId: row.linkId, access: toAccess(row.access), instructions: row.instructions };
  }
}

function toAccess(value: string | null): ClientAiSetting['access'] {
  return value === 'on' || value === 'off' ? value : null;
}
