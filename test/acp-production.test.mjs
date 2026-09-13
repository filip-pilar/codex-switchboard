import test from "node:test";
import assert from "node:assert/strict";
import { AgentTasks } from "../gateway/transport/acp/agent-tasks.mjs";
import {
  flattenTools,
  relayTools,
  toolItem,
  promptBlocks,
} from "../gateway/transport/acp/protocol.mjs";
test("production relay preserves custom input and namespaces", () => {
  const specs = flattenTools([
    {
      type: "namespace",
      name: "functions",
      tools: [{ type: "custom", name: "apply_patch", description: "patch" }],
    },
  ]);
  assert.equal(relayTools(specs)[0].name, "functions__apply_patch");
  assert.deepEqual(toolItem(specs[0], { input: "*** patch" }, "call_1"), {
    id: "call_1",
    call_id: "call_1",
    status: "completed",
    name: "apply_patch",
    namespace: "functions",
    type: "custom_tool_call",
    input: "*** patch",
  });
});
test("opaque child assignments fail closed; unique tasks and replies stay owned", () => {
  const a = new AgentTasks(),
    spec = { namespace: "collaboration", name: "spawn_agent" };
  a.dispatch("p1", "c1", spec, { task_name: "one", message: "assignment one" });
  a.dispatch("p1", "c2", spec, { task_name: "two", message: "assignment two" });
  const input = [
    {
      type: "agent_message",
      recipient: "/root/two",
      content: [{ type: "encrypted_content", encrypted_content: "opaque" }],
    },
  ];
  assert.throws(() => promptBlocks({ input }), /opaque_agent/);
  assert.equal(a.rewrite(input)[0].content[0].text, "assignment two");
  a.lookup("two").reply = "answer";
  assert.deepEqual(a.replies("p2"), []);
  assert.deepEqual(a.replies("p1"), ["answer"]);
  a.dispatch("p2", "c3", spec, { task_name: "two", message: "other" });
  assert.throws(() => a.rewrite(input), /ambiguous/);
  a.close("p2");
  assert.equal(a.lookup("two").message, "assignment two");
});

test("failed native spawn does not leave an ambiguous task alias on retry", () => {
  const a = new AgentTasks(),
    spec = { namespace: "collaboration", name: "spawn_agent" };
  a.dispatch("parent", "failed", spec, {
    task_name: "reader",
    message: "read",
  });
  a.bind("failed", "Error: spawn failed");
  a.dispatch("parent", "retry", spec, {
    task_name: "reader",
    message: "read again",
  });
  assert.equal(a.lookup("reader").message, "read again");
});
