import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';

// Only vite.e2e.config.ts aliases Clerk to this file. No real account or key is used.
const sessionKey = 'hub-mentorias-browser-test-session';

type TestAuth = {
  signedIn: boolean;
  signIn: () => void;
  signOut: (options?: { redirectUrl?: string }) => void;
};

const AuthContext = createContext<TestAuth | null>(null);

function useTestAuth(): TestAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Browser test Clerk provider is missing.');
  return auth;
}

export function publishableKeyFromHost(): string {
  return 'test-only-publishable-key';
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => sessionStorage.getItem(sessionKey) === 'signed-in');
  const signIn = () => {
    sessionStorage.setItem(sessionKey, 'signed-in');
    setSignedIn(true);
  };
  const signOut = ({ redirectUrl }: { redirectUrl?: string } = {}) => {
    sessionStorage.removeItem(sessionKey);
    setSignedIn(false);
    if (redirectUrl) window.location.assign(redirectUrl);
  };

  return <AuthContext.Provider value={{ signedIn, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function Show({ when, children }: { when: 'signed-in' | 'signed-out'; children: ReactNode }) {
  const { signedIn } = useTestAuth();
  return (when === 'signed-in') === signedIn ? children : null;
}

export function useClerk() {
  const auth = useTestAuth();
  return {
    signOut: auth.signOut,
    addListener: (listener: (state: { user: { id: string } | null }) => void) => {
      listener({ user: auth.signedIn ? { id: 'browser-test-manager' } : null });
      return () => {};
    },
  };
}

export function SignIn() {
  const { signIn } = useTestAuth();
  const [, navigate] = useLocation();

  return (
    <section data-testid="browser-test-sign-in">
      <h1 className="mb-4 text-2xl font-semibold">Entrar</h1>
      <button
        type="button"
        onClick={() => {
          signIn();
          navigate('/user-portal');
        }}
      >
        Entrar como pessoa de teste
      </button>
    </section>
  );
}

export function SignUp() {
  return <div>Cadastro indisponível nos testes de navegador.</div>;
}