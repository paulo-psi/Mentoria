import { useEffect, useRef } from 'react';
import { SignIn, SignUp, UserButton, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LockKeyhole, Waypoints } from 'lucide-react';
import { Link } from 'wouter';

export const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

export const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#39776d',
    colorForeground: '#213b3d',
    colorMutedForeground: '#526c6d',
    colorDanger: '#b14d3e',
    colorBackground: '#fdfcf9',
    colorInput: '#fffefa',
    colorInputForeground: '#213b3d',
    colorNeutral: '#d5d2c8',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fdfcf9] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d5d2c8] shadow-sm',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#213b3d] font-semibold',
    headerSubtitle: 'text-[#526c6d]',
    socialButtonsBlockButtonText: 'text-[#213b3d] font-semibold',
    formFieldLabel: 'text-[#213b3d] font-semibold',
    footerActionLink: 'text-[#39776d] font-semibold',
    footerActionText: 'text-[#526c6d]',
    dividerText: 'text-[#526c6d]',
    identityPreviewEditButton: 'text-[#39776d]',
    formFieldSuccessText: 'text-[#213b3d]',
    alertText: 'text-[#213b3d]',
    logoBox: 'mx-auto',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton: 'border border-[#d5d2c8] bg-white',
    formButtonPrimary: 'bg-[#39776d] text-white',
    formFieldInput: 'border border-[#d5d2c8] bg-white text-[#213b3d]',
    footerAction: 'text-[#526c6d]',
    dividerLine: 'bg-[#d5d2c8]',
    alert: 'border border-[#d5d2c8] bg-[#f6f4ef]',
    otpCodeFieldInput: 'border border-[#d5d2c8] text-[#213b3d]',
    formFieldRow: 'text-[#213b3d]',
    main: 'text-[#213b3d]',
  },
};

function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain min-h-[100dvh] bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-[440px]">
        <Link className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/">
          <Waypoints size={18} /> HUB de Mentorias PIBEP PUCPR
        </Link>
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  return (
    <AuthPage>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthPage>
  );
}

export function SignUpPage() {
  return (
    <AuthPage>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthPage>
  );
}

export function PublicHome() {
  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-5 py-5 sm:px-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Waypoints size={19} />
          </span>
          <span className="font-display text-lg leading-tight sm:text-xl">HUB de Mentorias PIBEP PUCPR</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 items-center px-5 py-16 sm:px-8">
        <div className="max-w-[630px]">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <LockKeyhole size={14} /> Acesso restrito
          </span>
          <h1 className="font-display text-4xl leading-tight tracking-[-0.04em] sm:text-6xl">
            HUB de Mentorias PIBEP PUCPR
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
            A relação de equipes, mentores e estudantes do PIBEP 2026 é reservada a pessoas autorizadas.
            Entre com sua conta para consultar as informações.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90" href="/sign-in">
              Entrar <ArrowRight size={16} />
            </Link>
            <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/sign-up">
              Criar conta com e-mail aprovado
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Criar uma conta não libera o acesso automaticamente. Seu e-mail precisa estar na lista de pessoas aprovadas.
          </p>
        </div>
      </main>
    </div>
  );
}

export function UserProfileButton() {
  return <UserButton />;
}

export function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}