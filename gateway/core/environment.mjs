import { join } from 'node:path';
export const gatewayEnvironmentValue = (env, suffix) => env[`SWITCHBOARD_${suffix}`];
export const defaultGatewayDataDirectory = home => join(home, 'Library', 'Application Support', 'Codex Switchboard');
