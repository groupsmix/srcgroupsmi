/**
 * Shared TypeScript interfaces for Cloudflare Pages Functions.
 */

export interface WorkerEnv {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_KEY?: string;
    STORE_KV?: KVNamespace;
    RATE_LIMIT_KV?: KVNamespace;
    CRON_SECRET?: string;
    GROQ_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    RESEND_API_KEY?: string;
    CONTACT_EMAIL_TO?: string;
    LEMONSQUEEZY_WEBHOOK_SECRET?: string;
    SENTRY_DSN_EDGE?: string;
    SENTRY_ENVIRONMENT?: string;
    SENTRY_RELEASE?: string;
    AI_QUOTA_DAILY_LIMIT?: string;
    [key: string]: any;
}

export interface SupabaseUser {
    id: string;
    aud: string;
    role: string;
    email: string;
    email_confirmed_at: string;
    phone: string;
    confirmed_at: string;
    last_sign_in_at: string;
    app_metadata: {
        provider: string;
        providers: string[];
        [key: string]: any;
    };
    user_metadata: {
        [key: string]: any;
    };
    identities: any[];
    created_at: string;
    updated_at: string;
}

export interface SupabaseProfile {
    id: string;
    role: string;
    email?: string;
    name?: string;
    [key: string]: any;
}

export interface PagesContext {
    request: Request;
    env: WorkerEnv;
    waitUntil: (promise: Promise<any>) => void;
    next: () => Promise<Response>;
    [key: string]: any;
}
