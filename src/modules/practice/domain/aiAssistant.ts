/**
 * A dietitian's AI assistant: the AI coach (`dietician` module) answering the
 * dietitian's clients in the dietitian's own voice. "Training" is prompt
 * context — persona, rules, per-client instructions and example answers —
 * not a fine-tuned model, so every change applies on the next message.
 */

export const AI_ADDRESS_FORMS = ['sen', 'siz'] as const;
export type AiAddressForm = (typeof AI_ADDRESS_FORMS)[number];

export const AI_LIMITS = {
  assistantNameLength: 60,
  shortTextLength: 500,
  longTextLength: 2000,
  maxListItems: 30,
  listItemLength: 300,
  maxScheduleWindows: 14,
  maxExamples: 200,
  exampleQuestionLength: 1000,
  exampleAnswerLength: 3000,
  clientInstructionsLength: 2000,
  /** Examples injected into one turn — enough to show the style, cheap on tokens. */
  examplesPerTurn: 5,
  /** Below this many relevant matches the newest examples fill in, for style. */
  minExamplesPerTurn: 3,
} as const;

/** ISO weekday: 1 = Monday … 7 = Sunday. `start >= end` = overnight (ends the next day); equal = 24h. */
export interface AiScheduleWindow {
  days: number[];
  start: string;
  end: string;
}

/** null schedule = always on. */
export interface AiSchedule {
  timeZone: string;
  windows: AiScheduleWindow[];
}

export interface DietitianAiSettings {
  dietitianId: string;
  enabled: boolean;
  defaultClientAccess: boolean;
  assistantName: string | null;
  addressForm: AiAddressForm | null;
  tone: string | null;
  approach: string | null;
  rules: string[];
  avoid: string[];
  handoffMessage: string | null;
  schedule: AiSchedule | null;
  updatedAt: Date | null;
}

export function defaultAiSettings(dietitianId: string): DietitianAiSettings {
  return {
    dietitianId,
    enabled: false,
    defaultClientAccess: true,
    assistantName: null,
    addressForm: null,
    tone: null,
    approach: null,
    rules: [],
    avoid: [],
    handoffMessage: null,
    schedule: null,
    updatedAt: null,
  };
}

export type AiExampleSource = 'manual' | 'correction';

export interface AiExample {
  id: string;
  dietitianId: string;
  question: string;
  answer: string;
  source: AiExampleSource;
  sourceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** null = follow the dietitian's `defaultClientAccess`. */
export type ClientAiAccess = 'on' | 'off' | null;

export interface ClientAiSetting {
  linkId: string;
  access: ClientAiAccess;
  instructions: string | null;
}

/** Whether this client gets the AI at all (ignoring the schedule). */
export function clientHasAi(settings: DietitianAiSettings, clientSetting: ClientAiSetting | null): boolean {
  if (!settings.enabled) {
    return false;
  }
  const access = clientSetting?.access ?? null;
  return access === null ? settings.defaultClientAccess : access === 'on';
}

/** "Dyt. Ayşe Yılmaz" → "Dyt. Ayşe Yılmaz'ın asistanı" is the client-facing default. */
export function assistantDisplayName(settings: DietitianAiSettings, dietitianName: string | null): string {
  if (settings.assistantName) {
    return settings.assistantName;
  }
  return dietitianName ? `${dietitianName} · AI asistan` : 'AI asistan';
}

// ── schedule ────────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function minuteOfDay(value: string): number {
  const match = TIME_PATTERN.exec(value)!;
  return Number(match[1]) * 60 + Number(match[2]);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function localMinuteOfWeek(now: Date, timeZone: string): number {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const day = WEEKDAYS[parts.weekday!]!;
  return (day - 1) * MINUTES_PER_DAY + Number(parts.hour) * 60 + Number(parts.minute);
}

/** Each window/day pair as [start minute-of-week, duration]. */
function intervals(schedule: AiSchedule): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const window of schedule.windows) {
    const start = minuteOfDay(window.start);
    const end = minuteOfDay(window.end);
    const duration = end > start ? end - start : end - start + MINUTES_PER_DAY;
    for (const day of window.days) {
      result.push([(day - 1) * MINUTES_PER_DAY + start, duration]);
    }
  }
  return result;
}

const mod = (value: number, by: number): number => ((value % by) + by) % by;

export function isWithinSchedule(schedule: AiSchedule | null, now: Date): boolean {
  if (!schedule) {
    return true;
  }
  const minute = localMinuteOfWeek(now, schedule.timeZone);
  return intervals(schedule).some(([start, duration]) => mod(minute - start, MINUTES_PER_WEEK) < duration);
}

/**
 * When the assistant next opens: `now` if it is open, null if the schedule
 * never opens. Works in local minute-of-week, so a DST shift inside the
 * next week can be off by that shift (Turkey has no DST).
 */
export function nextScheduleOpening(schedule: AiSchedule | null, now: Date): Date | null {
  if (isWithinSchedule(schedule, now)) {
    return now;
  }
  const all = intervals(schedule!);
  if (all.length === 0) {
    return null;
  }
  const minute = localMinuteOfWeek(now, schedule!.timeZone);
  const wait = Math.min(...all.map(([start]) => mod(start - minute, MINUTES_PER_WEEK)));
  const startOfMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(startOfMinute + wait * 60_000);
}

// ── example selection ───────────────────────────────────────────────────────

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const STOPWORDS = new Set([
  've', 'ile', 'bir', 'bu', 'su', 'icin', 'ama', 'gibi', 'mi', 'mu', 'ne', 'nasil', 'daha', 'cok', 'ben', 'sen',
  'benim', 'bana', 'var', 'yok', 'olur', 'olarak', 'kadar', 'hangi', 'neden', 'the', 'and', 'for', 'can', 'what',
  'how', 'should', 'with',
]);
/** Turkish is agglutinative — a 5-letter prefix is a cheap, decent stem ("kahvaltıda" ~ "kahvaltı"). */
const STEM_LENGTH = 5;

export function exampleTokens(text: string): Set<string> {
  const folded = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]|i̇/g, (char) => FOLD[char] ?? char)
    .replace(/[^a-z0-9]+/g, ' ');
  const tokens = new Set<string>();
  for (const word of folded.split(' ')) {
    if (word.length >= 3 && !STOPWORDS.has(word)) {
      tokens.add(word.slice(0, STEM_LENGTH));
    }
  }
  return tokens;
}

/**
 * The examples most relevant to the client's message (set cosine over stems),
 * topped up with the newest ones so the model always sees the dietitian's
 * style. Deterministic: ties go to the newer example.
 */
export function selectExamples(
  examples: AiExample[],
  message: string,
  limit: number = AI_LIMITS.examplesPerTurn,
  minimum: number = AI_LIMITS.minExamplesPerTurn,
): AiExample[] {
  const newestFirst = [...examples].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const query = exampleTokens(message);

  const scored = newestFirst
    .map((example) => {
      const tokens = exampleTokens(example.question);
      let shared = 0;
      for (const token of tokens) {
        if (query.has(token)) {
          shared++;
        }
      }
      const score = shared === 0 ? 0 : shared / Math.sqrt(tokens.size * query.size);
      return { example, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit).map((entry) => entry.example);
  for (const example of newestFirst) {
    if (selected.length >= Math.min(minimum, limit)) {
      break;
    }
    if (!selected.includes(example)) {
      selected.push(example);
    }
  }
  return selected;
}

// ── persona ─────────────────────────────────────────────────────────────────

/** Everything the AI coach needs to answer as this dietitian, for one turn. */
export interface AssistantPersona {
  dietitianId: string;
  dietitianName: string | null;
  assistantName: string;
  addressForm: AiAddressForm | null;
  tone: string | null;
  approach: string | null;
  rules: string[];
  avoid: string[];
  handoffMessage: string | null;
  /** The dietitian's private instructions for this one client. */
  clientInstructions: string | null;
  examples: Array<{ question: string; answer: string }>;
}

export function buildAssistantPersona(input: {
  settings: DietitianAiSettings;
  dietitianName: string | null;
  examples: AiExample[];
  message: string;
  clientInstructions: string | null;
}): AssistantPersona {
  const { settings } = input;
  return {
    dietitianId: settings.dietitianId,
    dietitianName: input.dietitianName,
    assistantName: assistantDisplayName(settings, input.dietitianName),
    addressForm: settings.addressForm,
    tone: settings.tone,
    approach: settings.approach,
    rules: settings.rules,
    avoid: settings.avoid,
    handoffMessage: settings.handoffMessage,
    clientInstructions: input.clientInstructions,
    examples: selectExamples(input.examples, input.message).map(({ question, answer }) => ({ question, answer })),
  };
}
