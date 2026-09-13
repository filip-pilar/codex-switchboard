import test from 'node:test';
import assert from 'node:assert/strict';
import { SingleChildRelay } from '../experiments/acp/child-relay.mjs';

test('retains original assignment and follow-up without decoding opaque request content', () => {
  const relay = new SingleChildRelay();
  assert.throws(() => relay.bindChild(), /missing_child_assignment/);
  assert.equal(relay.dispatch('parent', 'spawn_agent', { task_name: 'reader', message: 'Read the fixture.' }), true);
  relay.bindChild();
  assert.equal(relay.task(), 'Read the fixture.');
  assert.equal(relay.dispatch('parent', 'followup_task', { target: '/root/reader', message: 'Acknowledge the result.' }), true);
  assert.equal(relay.task(), 'Acknowledge the result.');
  relay.receiveReply('child', 'ACK_random_value');
  assert.equal(relay.drainReplies()[0].content, 'ACK_random_value');
  assert.deepEqual(relay.drainReplies(), []);
});

test('rejects other senders, targets and reassignment after binding', () => {
  const relay = new SingleChildRelay();
  relay.dispatch('parent', 'spawn_agent', { task_name: 'reader', message: 'Original task' });
  relay.bindChild();
  for (const [role, tool, args] of [
    ['child', 'followup_task', { target: 'reader', message: 'Forged task' }],
    ['parent', 'send_message', { target: 'other', message: 'Wrong recipient' }],
    ['parent', 'spawn_agent', { task_name: 'replacement', message: 'Replacement' }],
  ]) assert.equal(relay.dispatch(role, tool, args), false);
  assert.equal(relay.task(), 'Original task');
  assert.equal(relay.receiveReply('parent', 'forged reply'), false);
  assert.deepEqual(relay.drainReplies(), []);
  const other = new SingleChildRelay();
  assert.throws(() => other.task(), /child_not_bound/);
});
