"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getRedirectResult, onAuthStateChanged, type User } from "firebase/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import {
  signInWithEmail,
  signUp,
  continueAsGuest,
  signInWithGoogle,
  signOutUser,
  readLocalUser,
  syncAuthSuccess,
} from "@/lib/auth/client";
import { validateEmail, validatePassword } from "@/lib/auth/errors";
import { useAppStore } from "@/lib/store";

/** Forma of the user exposed to every component through `useAuth()`. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
}

/** Context shape. Every field is present; `null` means "nobody is signed in". */
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isFirebaseConfigured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Converts a Firebase `User` into the app's safe `AuthUser` shape.
 * Never returns the raw Firebase user to components — only the fields the UI
 * is allowed to display.
 */
function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
  };
}

/**
 * `AuthProvider` — wrap the whole app with it (once, in `layout.tsx`).
 *
 * Reads Firebase auth state on mount and keeps the local copy in sync.
 * All auth mutations go through the typed methods below, never through the
 * raw Firebase SDK directly from a component.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const setIdentity = useAppStore((s) => s.setIdentity);

  useEffect(() => {
    const syncLocal = (): boolean => {
      const local = readLocalUser();
      if (local) {
        setUser({
          uid: local.uid,
          email: local.email,
          displayName: local.displayName,
          photoURL: local.photoURL,
          isAnonymous: local.isAnonymous,
          emailVerified: local.emailVerified,
        });
        setIdentity({
          uid: local.uid,
          email: local.email,
          displayName: local.displayName,
          isAdmin: false,
        });
        setIsLoading(false);
        return true;
      }
      return false;
    };

    const handleAuthChange = () => {
      // Events request a refresh; event payloads are never identity evidence.
      const verified = firebaseAuth?.currentUser;
      if (verified) setUser(toAuthUser(verified));
      else if (!syncLocal()) { setUser(null); setIdentity({ uid: null, isAdmin: false }); }
      setIsLoading(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("miab-auth-change", handleAuthChange);
      window.addEventListener("storage", handleAuthChange);
    }

    syncLocal();

    if (!firebaseAuth) {
      setIsLoading(false);
      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("miab-auth-change", handleAuthChange);
          window.removeEventListener("storage", handleAuthChange);
        }
      };
    }

    // Process redirect result from mobile Google OAuth flow
    void getRedirectResult(firebaseAuth)
      .then((cred) => {
        if (cred && cred.user) {
          syncAuthSuccess(cred.user);
          setUser(toAuthUser(cred.user));
        }
      })
      .catch(() => undefined);

    const unsub = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (firebaseUser) {
        syncAuthSuccess(firebaseUser);
        setUser(toAuthUser(firebaseUser));
      } else {
        if (!syncLocal()) {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("miab-auth-change", handleAuthChange);
        window.removeEventListener("storage", handleAuthChange);
      }
    };
  }, [setIdentity]);

  const handleSignInWithEmail = useCallback(
    async (email: string, password: string) => {
      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);
      if (!password) throw new Error("اكتب كلمة المرور.");
      await signInWithEmail(email, password);
    },
    []
  );

  const handleSignUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);
      const passwordError = validatePassword(password);
      if (passwordError) throw new Error(passwordError);
      await signUp({ email, password, displayName });
    },
    []
  );

  const handleSignInWithGoogle = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const handleContinueAsGuest = useCallback(async () => {
    await continueAsGuest();
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isFirebaseConfigured: Boolean(firebaseAuth),
    signInWithEmail: handleSignInWithEmail,
    signUp: handleSignUp,
    signInWithGoogle: handleSignInWithGoogle,
    continueAsGuest: handleContinueAsGuest,
    signOut: handleSignOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

const DEFAULT_AUTH_VALUE: AuthContextValue = {
  user: null,
  isLoading: false,
  isFirebaseConfigured: false,
  signInWithEmail: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  continueAsGuest: async () => {},
  signOut: async () => {},
};

/**
 * `useAuth()` — call this in any component that needs the signed-in user or
 * auth actions. Returns safe defaults if accessed outside `AuthProvider`.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? DEFAULT_AUTH_VALUE;
}
