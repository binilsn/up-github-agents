import { defineMcpConnection } from '@flue/runtime';

const NAME = 'context7';
const TOOLS = ['resolve_library_id', 'query_documentation'] as const;

/**
 * Context7 MCP connection — fetches up-to-date library documentation on demand.
 * Only usable when `CONTEXT7_API_KEY` is set in the environment.
 *
 * Usage in an agent:
 * ```ts
 * if (process.env.CONTEXT7_API_KEY) {
 *   useMcpConnection(context7);
 * }
 * ```
 */
export const context7 = defineMcpConnection({
  name: NAME,
  url: process.env.CONTEXT7_URL ?? 'https://mcp.context7.com/mcp',
  auth: () => {
    const key = process.env.CONTEXT7_API_KEY;
    if (!key) {
      throw new Error(
        'CONTEXT7_API_KEY is not set. Export it or add it to your .env file.',
      );
    }
    return key;
  },
  optional: true,
  tools: [...TOOLS],
});

/** MCP tool names as the framework exposes them (mcp__<connection>__<tool>). */
export const context7ToolNames = TOOLS.map((t) => `mcp__${NAME}__${t}`);
