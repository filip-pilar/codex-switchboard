import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveBridgePaths(env = process.env) {
  const home = resolve(env.HOME || homedir());
  const bridgeDataDir = resolve(
    env.SWITCHBOARD_DATA_DIR ||
      join(home, "Library", "Application Support", "Codex Switchboard"),
  );
  const grokHome = resolve(env.GROK_HOME || join(home, ".grok"));
  const devinCredentialsPath = resolve(
    env.DEVIN_CREDENTIALS_FILE ||
      join(home, ".local", "share", "devin", "credentials.toml"),
  );
  return {
    bridgeDataDir,
    grokHome,
    grokCredentialsPath: join(grokHome, "auth.json"),
    devinCredentialsPath,
  };
}

export const {
  bridgeDataDir,
  grokHome,
  grokCredentialsPath,
  devinCredentialsPath,
} = resolveBridgePaths();
