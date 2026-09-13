// Plaintext task arguments are retained in memory before Codex encrypts its
// collaboration envelope. Ambiguous recipients never receive another task.
export class AgentTasks {
  constructor() {
    this.tasks = new Map();
  }
  dispatch(owner, callId, spec, args) {
    if (spec.namespace !== "collaboration") return;
    if (
      typeof args.message === "string" &&
      Buffer.byteLength(args.message) > 1024 * 1024
    )
      throw Error("agent_message_limit");
    if (this.tasks.size >= 64 && spec.name === "spawn_agent")
      throw Error("agent_task_limit");
    if (
      spec.name === "spawn_agent" &&
      typeof args.task_name === "string" &&
      typeof args.message === "string"
    )
      this.tasks.set(callId, {
        owner,
        aliases: new Set([args.task_name]),
        message: args.message,
        version: 0,
      });
    if (
      ["followup_task", "send_message"].includes(spec.name) &&
      typeof args.target === "string" &&
      typeof args.message === "string"
    ) {
      const found = this.lookup(args.target);
      if (found) {
        const sibling = [...this.tasks.values()].some(
          (t) => t.boundOwner === owner && t.owner === found.owner,
        );
        if (found.owner !== owner && !sibling)
          throw Error("foreign_agent_target");
        found.message = args.message;
        found.version++;
      }
    }
  }
  lookup(target) {
    if (typeof target !== "string") return;
    const found = [...this.tasks.values()].filter((t) =>
      [...t.aliases].some((a) => a === target || target.endsWith("/" + a)),
    );
    if (found.length > 1) throw Error("ambiguous_agent_target");
    return found[0];
  }
  bind(callId, output) {
    const t = this.tasks.get(callId);
    if (!t) return;
    const raw = typeof output === "string" ? output : JSON.stringify(output);
    const ids = raw.match(/[0-9a-f]{8}-[0-9a-f-]{27,36}/g) ?? [];
    if (!ids.length && /\berror\b|\bfailed\b/i.test(raw)) {
      this.tasks.delete(callId);
      return;
    }
    for (const id of ids) t.aliases.add(id);
  }
  rewrite(input) {
    return (input ?? []).map((item) => {
      if (item.type !== "agent_message") return item;
      const t = this.lookup(item.recipient);
      if (!t) return item;
      return { ...item, content: [{ type: "input_text", text: t.message }] };
    });
  }
  replies(owner) {
    const out = [];
    for (const t of this.tasks.values())
      if (t.owner === owner && t.reply) {
        out.push(t.reply);
        t.reply = undefined;
      }
    return out;
  }
  close(owner) {
    for (const [key, t] of this.tasks)
      if (t.owner === owner) this.tasks.delete(key);
  }
}
