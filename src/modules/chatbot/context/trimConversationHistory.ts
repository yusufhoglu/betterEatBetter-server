import {
  DEFAULT_MAX_HISTORY_MESSAGES,
  trimHistory,
} from '../../../shared/llm/conversation/trimHistory';

/**
 * Chatbot's context window is the shared `trimHistory` helper
 * (`shared/llm/conversation/trimHistory.ts`) under the module's historical
 * names — kept as a thin re-export so existing imports and the module rule doc
 * stay valid.
 */
export const DEFAULT_MAX_CONTEXT_MESSAGES = DEFAULT_MAX_HISTORY_MESSAGES;
export const trimConversationHistory = trimHistory;
