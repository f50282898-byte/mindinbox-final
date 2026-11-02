// Only Firebase browser configuration is public. Keep this allowlist explicit.
const publicFields = [
  "API_KEY", "APP_ID", "PROJECT_ID", "AUTH_DOMAIN", "STORAGE_BUCKET",
  "MESSAGING_SENDER_ID", "MEASUREMENT_ID",
];

export function publicFirebaseAliases(environment) {
  const aliases = {};
  for (const field of publicFields) {
    const canonical = "NEXT_PUBLIC_FIREBASE_" + field;
    const legacy = environment["NEXT_PUBLIC_FB_" + field]?.trim();
    if (!environment[canonical]?.trim() && legacy) aliases[canonical] = legacy;
  }
  return aliases;
}
