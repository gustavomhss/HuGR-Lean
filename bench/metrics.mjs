// Per-run metrics computed only from the `opencode export` of that run's session.
const RECALL_LINE = "[full output: lean recall ";
const DISK_FULL = /No space left on device|ENOSPC|Insufficient Storage/;
const PROVIDER_LIMIT = /rate.?limit|too many requests|\b429\b|usage limit|quota|overloaded|insufficient_quota/i;

export function sessionMetrics(exported) {
  const m = {
    llmCalls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0,
    toolCalls: 0, toolOutputBytes: 0, toolOutputBytesByTool: {}, leanRecallCalls: 0, leanSummaries: 0,
    readOffsetCalls: 0, diskFullSeen: false, errors: [],
  };
  for (const message of exported.messages ?? []) {
    const info = message.info ?? {};
    if (info.role === "assistant") {
      m.llmCalls++;
      const t = info.tokens ?? {};
      m.inputTokens += t.input ?? 0;
      m.outputTokens += t.output ?? 0;
      m.reasoningTokens += t.reasoning ?? 0;
      m.cachedInputTokens += t.cache?.read ?? 0;
      m.cacheWriteTokens += t.cache?.write ?? 0;
      if (info.error) m.errors.push({ name: info.error.name ?? "error", message: String(info.error.data?.message ?? info.error.message ?? "").slice(0, 300) });
    }
    for (const part of message.parts ?? []) {
      if (part.type !== "tool") continue;
      m.toolCalls++;
      const output = typeof part.state?.output === "string" ? part.state.output : "";
      const bytes = Buffer.byteLength(output, "utf8");
      m.toolOutputBytes += bytes;
      m.toolOutputBytesByTool[part.tool] = (m.toolOutputBytesByTool[part.tool] ?? 0) + bytes;
      if (DISK_FULL.test(output)) m.diskFullSeen = true;
      if (part.tool === "lean_recall") m.leanRecallCalls++;
      if (output.includes(RECALL_LINE)) m.leanSummaries++;
      if (part.tool === "read" && Number(part.state?.input?.offset) > 1) m.readOffsetCalls++;
    }
  }
  // Everything the provider processed as prompt: uncached + cache reads + cache writes.
  m.totalInputTokens = m.inputTokens + m.cachedInputTokens + m.cacheWriteTokens;
  return m;
}

/** True when the run was stopped by the provider (rate/usage limit, overload), not by the task. */
export function providerFailure(metrics, stderr) {
  // The host machine ran out of disk during the run: the environment, not the task, failed.
  if (metrics.diskFullSeen || DISK_FULL.test(stderr)) return "disk-full";
  if (PROVIDER_LIMIT.test(stderr)) return "provider-limit";
  const hard = metrics.errors.filter((e) => e.name !== "MessageAbortedError");
  if (hard.some((e) => PROVIDER_LIMIT.test(`${e.name} ${e.message}`))) return "provider-limit";
  if (hard.length) return `provider-error:${hard[0].name}`;
  return null;
}
