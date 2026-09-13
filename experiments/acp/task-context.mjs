// Experimental text transport; this does not preserve a native role hierarchy.
export function taskContext(input = []) {
  return input.filter(item => ['user', 'developer'].includes(item.role) || item.type === 'agent_message')
    .map(item => {
      const content = typeof item.content === 'string' ? item.content
        : Array.isArray(item.content) ? item.content.map(part => part.text || '').join('\n')
          : JSON.stringify(item.content || '');
      return `[${item.role || 'agent_message'}]\n${content}`;
    }).join('\n\n');
}
