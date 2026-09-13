import { randomUUID } from 'node:crypto';

// Bounded probe transport, not a general multi-child router. Plaintext stays in memory.
export class SingleChildRelay {
  #name;
  #task;
  #bound = false;
  #replies = [];

  dispatch(role, tool, args = {}) {
    if (role !== 'parent' || typeof args.message !== 'string') return false;
    if (tool === 'spawn_agent' && !this.#bound && typeof args.task_name === 'string') {
      this.#name = args.task_name;
      this.#task = args.message;
      return true;
    }
    if (this.#bound && ['followup_task', 'send_message'].includes(tool)
      && [this.#name, `/root/${this.#name}`].includes(args.target)) {
      this.#task = args.message;
      return true;
    }
    return false;
  }

  bindChild() {
    if (this.#task === undefined) throw new Error('missing_child_assignment');
    this.#bound = true;
  }

  task() {
    if (!this.#bound) throw new Error('child_not_bound');
    return this.#task;
  }

  receiveReply(role, text) {
    if (role !== 'child' || !this.#bound || typeof text !== 'string') return false;
    this.#replies.push({ type: 'agent_message', id: randomUUID(), author: this.#name, content: text });
    return true;
  }

  drainReplies() { return this.#replies.splice(0); }
}
