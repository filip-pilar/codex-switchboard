import { readProtected } from "./files.mjs";
import { devinCredentialsPath } from "./paths.mjs";

export function parseTomlString(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern =
    "^\\s*" +
    escapedKey +
    "\\s*=\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|'[^']*')\\s*(?:#.*)?$";
  const match = source.match(
    new RegExp(pattern, "m"),
  );
  if (!match) return null;

  if (match[1].startsWith("'")) return match[1].slice(1, -1);
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function readDevinSessionToken(path = devinCredentialsPath) {
  let source;
  try {
    source = readProtected(path, { limit: 1024 * 1024 }).toString("utf8");
  } catch (error) {
    throw new Error(
      `Cannot securely read Devin credentials at ${path}. Run \`devin auth login\` first and ensure it is a regular mode-600 file.`,
      { cause: error },
    );
  }

  const token = parseTomlString(source, "windsurf_api_key")?.trim();
  if (!token || token.length > 16384 || /[,\s\x00-\x20\x7f]/.test(token)) {
    throw new Error(
      `Devin credentials at ${path} do not contain a windsurf_api_key. Run \`devin auth login\` again.`,
    );
  }

  return token;
}
