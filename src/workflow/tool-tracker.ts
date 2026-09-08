/**
 * Track tool calls via Flue onEvent callbacks.
 *
 * Returns a map of toolCallId → toolName and an onEvent handler that
 * records outputs for the requested tool names.
 */
export function trackTools(
  ...names: string[]
): {
  toolNames: Map<string, string>;
  outputs: Map<string, unknown>;
  onEvent: (chunk: { type: string; toolCallId?: string; toolName?: string; output?: unknown }) => void;
} {
  const toolNames = new Map<string, string>();
  const outputs = new Map<string, unknown>();
  const nameSet = new Set(names);
  return {
    toolNames,
    outputs,
    onEvent: (chunk) => {
      if (chunk.type === 'tool-input' && chunk.toolCallId && chunk.toolName) {
        toolNames.set(chunk.toolCallId, chunk.toolName);
      } else if (chunk.type === 'tool-output' && chunk.toolCallId && nameSet.has(toolNames.get(chunk.toolCallId) ?? '')) {
        outputs.set(chunk.toolCallId, chunk.output);
      }
    },
  };
}
