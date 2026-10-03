export {};

import { updateProfile, type User } from "firebase/auth";

/**
 * Binds `updateProfile` onto the `User` interface.
 *
 * The modular Firebase SDK splits `User` methods across entry points: auth
 * lives in `firebase/auth`, profile updates in `firebase/auth/profile` (or
 * `firebase/profile`, which re-exports it). Importing this module anywhere that
 * calls `user.updateProfile(...)` makes the method exist at runtime *and*
 * satisfies the type.
 *
 * A side-effect module on purpose — it exports nothing to call.
 */
declare module "firebase/auth" {
  interface User {
    updateProfile: (profile: { displayName?: string | null; photoURL?: string | null }) => Promise<void>;
  }
}

/** Convenience wrapper, for callers that prefer not to reach for the instance method. */
export function setDisplayName(user: User, displayName: string): Promise<void> {
  return updateProfile(user, { displayName });
}
