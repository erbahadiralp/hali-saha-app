import { onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { registerForPushNotificationsAsync } from '../services/pushNotifications';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Refresh user data (call after email verification)
  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        // Get the fresh user from auth - don't spread to avoid creating new reference
        const freshUser = auth.currentUser;
        // Only update state if emailVerified status actually changed
        setUser(prev => {
          if (prev?.emailVerified !== freshUser.emailVerified) {
            return freshUser;
          }
          return prev;
        });
      } catch (error) {
        console.log('Error refreshing user:', error);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // Register for push notifications when user logs in
      if (currentUser) {
        registerForPushNotificationsAsync(currentUser.uid).catch(err => {
          console.log('Push notification registration skipped:', err);
        });
      }
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
