export class BoardError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function safeError(error) {
  if (error instanceof BoardError) return { code: error.code, message: error.message };
  const code = ['EADDRINUSE', 'ENOENT', 'EACCES', 'EPERM', 'unsafe_symlink', 'unsafe_file', 'unsafe_owner', 'unsafe_directory','helper_already_running','unknown_helper_lock'].includes(error?.code ?? error?.message) ? (error.code ?? error.message) : 'operation_failed';
  return { code, message: ({ EADDRINUSE: 'Port 9477 is occupied. Switchboard will not take over another service.', ENOENT: 'A required file or official CLI is missing.', EACCES: 'Private storage could not be accessed.', EPERM: 'The operating system denied this operation.', helper_already_running: 'Another Switchboard helper is running. Quit that app instance before trying again.', unknown_helper_lock: 'The helper ownership record is incomplete. Inspect private app storage before recovery.', unsafe_symlink: 'A protected path contains a symbolic link. Choose a regular, privately owned path.' })[code] ?? 'The operation could not be completed safely. Check connection and installation status.' };
}
