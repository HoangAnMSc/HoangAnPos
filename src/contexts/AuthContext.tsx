import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, requireSupabaseConfig, supabase } from "../lib/supabase";
import type { AppRole, Profile } from "../types";
import { allRolePermissionKeys, type AppPermissionKey } from "../lib/permissions";

type ProfileWithRole = Profile & {
  app_roles?: AppRole | null;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  rolePermissions: string[];
  loading: boolean;
  isAdmin: boolean;
  canAccess: (permission: AppPermissionKey | string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, app_roles(*)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProfileWithRole | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    try {
      const nextProfile = await loadProfile(user.id);
      setProfile(nextProfile);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function hydrateSession() {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;

        if (mounted) {
          setUser(sessionUser);
          setProfileLoading(Boolean(sessionUser));
        }
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!sessionUser) {
        setProfile(null);
        setProfileLoading(false);
      } else {
        setProfileLoading(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured || authLoading) {
      return () => {
        mounted = false;
      };
    }

    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return () => {
        mounted = false;
      };
    }

    const currentUser = user;

    async function hydrateProfile() {
      setProfileLoading(true);

      try {
        const nextProfile = await loadProfile(currentUser.id);
        if (mounted) {
          setProfile(nextProfile);
        }
      } catch {
        if (mounted) {
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setProfileLoading(false);
        }
      }
    }

    hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  const signIn = useCallback(async (email: string, password: string) => {
    requireSupabaseConfig();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    setProfileLoading(true);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    requireSupabaseConfig();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    if (!user || !profile?.is_active) {
      return;
    }

    let mounted = true;

    async function updateLastSeen() {
      if (!mounted) {
        return;
      }

      try {
        await supabase.rpc("touch_last_seen");
      } catch {
        // Older databases may not have this helper until schema.sql is rerun.
      }
    }

    void updateLastSeen();
    const interval = window.setInterval(() => {
      void updateLastSeen();
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [profile?.is_active, user]);

  const role = profile?.app_roles ?? null;
  const isSuperAdmin =
    profile?.role === "admin" ||
    role?.code === "admin" ||
    user?.app_metadata?.role === "admin";
  const hasActiveRolePermissions = Boolean(role?.is_active && role.permissions.length > 0);
  const isAdmin =
    profile?.is_active !== false &&
    (isSuperAdmin || hasActiveRolePermissions);
  const rolePermissions = useMemo(
    () => {
      if (profile?.is_active === false) {
        return [];
      }

      if (isSuperAdmin) {
        return allRolePermissionKeys;
      }

      return role?.is_active ? role.permissions : [];
    },
    [isSuperAdmin, profile?.is_active, role]
  );
  const canAccess = useCallback(
    (permission: AppPermissionKey | string) => rolePermissions.includes(permission),
    [rolePermissions]
  );
  const loading = authLoading || profileLoading;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      rolePermissions,
      loading,
      isAdmin,
      canAccess,
      signIn,
      signOut,
      refreshProfile,
    }),
    [canAccess, isAdmin, loading, profile, refreshProfile, role, rolePermissions, signIn, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
