import test from 'node:test';
import assert from 'node:assert/strict';
import { taskContext } from '../experiments/acp/task-context.mjs';

test('child assignments and follow-ups survive without being user messages', () => {
  const input = [
    { role: 'developer', content: [{ type: 'input_text', text: 'Use caller tools.' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'Workspace context.' }] },
    { type: 'agent_message', author: 'parent', recipient: 'child', content: 'Read the assigned file.' },
  ];
  const initial = taskContext(input);
  assert.match(initial, /Read the assigned file\./);
  const followup = taskContext([...input,
    { type: 'agent_message', content: [{ type: 'input_text', text: 'Acknowledge the previous result.' }] },
  ]);
  assert.notEqual(followup, initial);
  assert.match(followup, /Acknowledge the previous result\./);
  assert.equal(taskContext([...input, { type: 'function_call_output', output: 'tool result' }]), initial);
});
