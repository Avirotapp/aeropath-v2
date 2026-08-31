import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { getCurrentUserContext } from "../lib/database";

import {
  getSession,
  onAuthStateChange,
  signOut,
} from "../lib/auth";

const AuthContext = createContext(null);

const ROLE_PRIORITY = [
  "ADMIN",
  "SAFETY_MANAGER",
  "INSTRUCTOR",
  "STUDENT",
];

function determinePrimaryRole(roles) {
  const assignedRoles = roles.map((item) => item.role);

  return (
    ROLE_PRIORITY.find((role) =>
      assignedRoles.includes(role)
    ) ?? null
  );
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [roles, setRoles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadUserContext() {
    try {
      setError(null);

      const currentSession = await getSession();

      setSession(currentSession);

      if (!currentSession) {
        setUser(null);
        setProfile(null);
        setRoles([]);
        return;
      }

      const context = await getCurrentUserContext();

      setUser(context.user);
      setProfile(context.profile);
      setRoles(context.roles);
    } catch (err) {
      console.error(
        "Failed to load AeroPath authentication context:",
        err
      );

      setError(err);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initialise() {
      try {
        if (!mounted) {
          return;
        }

        await loadUserContext();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initialise();

    const subscription = onAuthStateChange(
      async (_event, currentSession) => {
        if (!mounted) {
          return;
        }

        setSession(currentSession);

        if (!currentSession) {
          setUser(null);
          setProfile(null);
          setRoles([]);
          setError(null);
          return;
        }

        await loadUserContext();
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await signOut();

    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setError(null);
  }

  const primaryRole = determinePrimaryRole(roles);

  const accountStatus =
    profile?.account_status ?? null;

  const isAuthenticated =
    Boolean(session && user);

  const isApproved =
    accountStatus === "APPROVED";

  const isPending =
    accountStatus === "PENDING";

  const isRejected =
    accountStatus === "REJECTED";

  const isSuspended =
    accountStatus === "SUSPENDED";

  const value = {
    session,
    user,
    profile,
    roles,

    primaryRole,
    accountStatus,

    isAuthenticated,
    isApproved,
    isPending,
    isRejected,
    isSuspended,

    loading,
    error,

    refreshUserContext: loadUserContext,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider"
    );
  }

  return context;
}