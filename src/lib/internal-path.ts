// Browser URL parsing treats backslashes as slashes and strips tabs and newlines.
export function isInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  return !Array.from(value).some(char => char === "\\" || char.charCodeAt(0) < 32);
}
