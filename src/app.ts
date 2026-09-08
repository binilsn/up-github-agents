import { setProvider } from '@flue/runtime';

// Default model specifier (used by agents as fallback)
export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

// Built-in providers that don't need custom registration
const BUILTIN_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'google',
  'amazon-bedrock',
  'google-vertex',
  'groq',
  'mistral',
  'xai',
  'deepseek',
  'cerebras',
  'together',
  'fireworks',
  'openrouter',
  'cloudflare',
]);

/**
 * Resolve the provider ID from a model specifier.
 * Input: "provider/model-id" → Output: "provider"
 */
function extractProviderId(modelSpecifier: string): string {
  const slashIndex = modelSpecifier.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model specifier "${modelSpecifier}". Expected format: "provider/model-id"`,
    );
  }
  return modelSpecifier.slice(0, slashIndex);
}

/**
 * Register a custom provider based on environment variables.
 *
 * Required env vars:
 *   AGENT_MODEL - Full model specifier (e.g., "mimo/mimo-model-id")
 *
 * Optional env vars:
 *   AGENT_PROVIDER_ID        - Override provider ID (default: extracted from AGENT_MODEL)
 *   AGENT_PROVIDER_BASE_URL  - Base URL for the custom provider
 *   AGENT_PROVIDER_API       - Wire protocol: "openai-completions" (default) or "anthropic-messages"
 *   AGENT_API_KEY            - API key for the custom provider
 *   AGENT_MODEL_MAX_TOKENS   - Max output tokens (default: 8192)
 *   AGENT_MODEL_CONTEXT_WINDOW - Context window size (default: 1000000)
 *   AGENT_MODEL_REASONING    - Enable reasoning/thinking (default: false)
 */
// Mapping of provider IDs to their environment variable names
const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  'amazon-bedrock': 'AWS_BEARER_TOKEN_BEDROCK',
  'google-vertex': 'GOOGLE_APPLICATION_CREDENTIALS',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  together: 'TOGETHER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  xiaomi: 'XIAOMI_API_KEY',
};

async function registerCustomProvider(): Promise<void> {
  const modelSpecifier = process.env.AGENT_MODEL;
  if (!modelSpecifier) {
    // No model configured, use defaults
    return;
  }

  const providerId =
    process.env.AGENT_PROVIDER_ID ?? extractProviderId(modelSpecifier);

  const apiKey = process.env.AGENT_API_KEY;

  // For built-in providers, set the provider-specific env var from AGENT_API_KEY
  if (BUILTIN_PROVIDERS.has(providerId)) {
    if (apiKey) {
      const envVar = PROVIDER_ENV_VARS[providerId];
      if (envVar && !process.env[envVar]) {
        process.env[envVar] = apiKey;
        console.log(
          `[app] Set ${envVar} from AGENT_API_KEY for provider "${providerId}"`,
        );
      }
    }
    return;
  }

  // Dynamic import for Pi (only needed for custom providers)
  const { createProvider } = await import('@earendil-works/pi-ai');
  const { openAICompletionsApi } = await import(
    '@earendil-works/pi-ai/api/openai-completions.lazy'
  );
  const { anthropicMessagesApi } = await import(
    '@earendil-works/pi-ai/api/anthropic-messages.lazy'
  );

  const baseUrl = process.env.AGENT_PROVIDER_BASE_URL;
  const apiType = process.env.AGENT_PROVIDER_API ?? 'openai-completions';

  // Model-specific configuration. Context window defaults to 1M tokens to
  // accommodate modern models (DeepSeek, GPT-4, Claude). Override via
  // AGENT_MODEL_CONTEXT_WINDOW if your model has a smaller window.
  const maxTokens = Number(process.env.AGENT_MODEL_MAX_TOKENS) || 8192;
  const contextWindow = Number(process.env.AGENT_MODEL_CONTEXT_WINDOW) || 1000000;
  const reasoning = process.env.AGENT_MODEL_REASONING === 'true';

  if (!baseUrl) {
    throw new Error(
      `Custom provider "${providerId}" requires AGENT_PROVIDER_BASE_URL to be set.`,
    );
  }

  // Extract model ID from specifier
  const modelId = modelSpecifier.slice(providerId.length + 1);
  if (!modelId) {
    throw new Error(
      `Invalid model specifier "${modelSpecifier}". Model ID is empty.`,
    );
  }

  // Select wire protocol API
  const api =
    apiType === 'anthropic-messages' ? anthropicMessagesApi() : openAICompletionsApi();

  setProvider(
    createProvider({
      id: providerId,
      auth: {
        apiKey: {
          name: `${providerId} API Key`,
          resolve: async () => ({
            auth: apiKey ? { apiKey } : {},
          }),
        },
      },
      models: [
        {
          id: modelId,
          name: `${providerId}/${modelId}`,
          api: apiType as 'openai-completions' | 'anthropic-messages',
          provider: providerId,
          baseUrl,
          reasoning,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow,
          maxTokens,
        },
      ],
      api,
    }),
  );

  console.log(
    `[app] Registered custom provider "${providerId}" with base URL "${baseUrl}"`,
  );
}

// Register custom provider at module load time
await registerCustomProvider();
