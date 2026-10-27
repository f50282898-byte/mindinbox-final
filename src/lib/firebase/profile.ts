import { updateProfile, type User } from "firebase/auth";

/** Modular SDK wrapper; no methods are added to User at runtime. */
export function setDisplayName(user: User, displayName: string): Promise<void> {
  return updateProfile(user, { displayName });
}
