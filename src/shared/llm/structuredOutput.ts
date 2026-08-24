import { z } from 'zod';
import { IntegrationError } from '../errors/IntegrationError';
import type { LlmClient } from './LlmClient';
import type { LlmCompleteRequest, LlmToolDefinition } from './types';

const STRUCTURED_OUTPUT_TOOL_NAME = 'report_result';
const DEFAULT_TOOL_DESCRIPTION = 'Reports the final structured result. Always call this tool exactly once, with the complete result.';

export interface RequestStructuredOutputOptions<T> {
  readonly client: LlmClient;
  readonly request: Omit<LlmCompleteRequest, 'tools' | 'forceToolChoice'>;
  readonly resultSchema: z.ZodType<T>;
  readonly toolDescription?: string;
}

/**
 * The "forced tool call" structured-output trick: native JSON mode isn't used
 * because provider guarantees differ. Instead this defines a fake
 * "report_result" tool from `resultSchema`, forces the model to call it via
 * `forceToolChoice`, and parses the call's input against the same schema —
 * a technique that works identically across every provider.
 */
export async function requestStructuredOutput<T>(options: RequestStructuredOutputOptions<T>): Promise<T> {
  const { client, request, resultSchema, toolDescription } = options;

  const tool: LlmToolDefinition = {
    name: STRUCTURED_OUTPUT_TOOL_NAME,
    description: toolDescription ?? DEFAULT_TOOL_DESCRIPTION,
    inputSchema: zodToJsonSchema(resultSchema),
  };

  const response = await client.complete({
    ...request,
    tools: [tool],
    forceToolChoice: { toolName: STRUCTURED_OUTPUT_TOOL_NAME },
  });

  const toolCall = response.message.toolCalls?.find((call) => call.name === STRUCTURED_OUTPUT_TOOL_NAME);
  if (!toolCall) {
    throw new IntegrationError(
      'STRUCTURED_OUTPUT_TOOL_NOT_CALLED',
      'Model did not call the forced structured-output tool',
      false,
    );
  }

  return resultSchema.parse(toolCall.input);
}

/**
 * Minimal zod -> JSON Schema converter, covering only what a structured-output
 * result shape needs (object/string/number/boolean/enum/array/optional/
 * nullable/default/literal). Deliberately hand-rolled rather than a new
 * dependency — this turn's dependency list is limited to the two LLM SDKs.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;

  switch (def.typeName as z.ZodFirstPartyTypeKind) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        properties[key] = zodToJsonSchema(fieldSchema);
        if (!fieldSchema.isOptional()) {
          required.push(key);
        }
      }
      return { type: 'object', properties, required, additionalProperties: false };
    }
    case z.ZodFirstPartyTypeKind.ZodString:
      return withDescription(def, { type: 'string' });
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return withDescription(def, { type: 'number' });
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withDescription(def, { type: 'boolean' });
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withDescription(def, { type: 'string', enum: def.values });
    case z.ZodFirstPartyTypeKind.ZodArray:
      return withDescription(def, { type: 'array', items: zodToJsonSchema(def.type) });
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return zodToJsonSchema(def.innerType);
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return { type: typeof def.value, const: def.value };
    default:
      throw new Error(`zodToJsonSchema: unsupported zod type "${def.typeName}"`);
  }
}

function withDescription(def: { description?: string }, jsonSchema: Record<string, unknown>): Record<string, unknown> {
  return def.description ? { ...jsonSchema, description: def.description } : jsonSchema;
}
