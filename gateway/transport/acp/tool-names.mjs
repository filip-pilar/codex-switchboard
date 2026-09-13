// Preserve the caller namespace in the name exported by the private MCP relay.
export function callerToolName(tool) {
  return tool.namespace
    ? `${tool.namespace}${tool.namespace.endsWith("__") ? "" : "__"}${tool.name}`
    : tool.name;
}

export function findCallerTool(tools, name, allowRelayPrefix = true) {
  const exact = tools.filter((tool) => callerToolName(tool) === name);
  const matches = exact.length
    ? exact
    : tools.filter((tool) => tool.name === name);
  if (matches.length > 1) throw new Error("ambiguous_caller_tool");
  if (!matches.length && allowRelayPrefix && name?.startsWith("mcp__codex__")) {
    return findCallerTool(tools, name.slice("mcp__codex__".length), false);
  }
  return matches[0];
}

export function isCallerTool(tools, name) {
  try {
    return Boolean(
      findCallerTool(
        tools.filter((t) => t.type === "function"),
        name,
      ),
    );
  } catch {
    return false;
  }
}
