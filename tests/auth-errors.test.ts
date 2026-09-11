import { describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/gateway';

/**
 * Auth failures have to stay distinguishable.
 *
 * Flattening every Supabase error into "email and password do not match"
 * once cost a real investigation: an admin account that existed, had the
 * right password and the right role could not sign in, and the only
 * message on screen pointed at the one thing that was fine. These pin
 * the two cases apart.
 */

// `signUp` resolves its confirmation redirect from the request origin,
// which needs a request to exist.
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === 'x-forwarded-host'
        ? 'www.findplce.com'
        : name.toLowerCase() === 'x-forwarded-proto'
          ? 'https'
          : null,
  }),
}));

function gatewayWith(signInResult: unknown, signUpResult?: unknown) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(signInResult),
      signUp: vi.fn().mockResolvedValue(signUpResult),
    },
  };
}

const { SupabaseAuthGateway } = await import('@/lib/auth/supabase-gateway');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = (client: unknown) => new SupabaseAuthGateway(client as any);

describe('sign in', () => {
  it('reports an unconfirmed address as such, by error code', async () => {
    const gateway = make(
      gatewayWith({ data: { user: null }, error: { code: 'email_not_confirmed', message: 'x' } }),
    );

    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'email_not_confirmed',
    });
    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toThrow(/confirm your email/i);
  });

  it('also detects it from the message when no code is present', async () => {
    const gateway = make(
      gatewayWith({ data: { user: null }, error: { message: 'Email not confirmed' } }),
    );

    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'email_not_confirmed',
    });
  });

  it('still reports a genuinely wrong password as invalid credentials', async () => {
    const gateway = make(
      gatewayWith({
        data: { user: null },
        error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
      }),
    );

    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toThrow(/do not match/i);
  });

  it('does not mistake an unrelated failure for an unconfirmed address', async () => {
    const gateway = make(
      gatewayWith({ data: { user: null }, error: { message: 'network unreachable' } }),
    );

    await expect(gateway.signIn('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('returns the user id on success', async () => {
    const gateway = make(gatewayWith({ data: { user: { id: 'usr_1' } }, error: null }));
    await expect(gateway.signIn('a@b.com', 'pw')).resolves.toBe('usr_1');
  });
});

describe('sign up', () => {
  it('flags confirmation required when a user comes back without a session', async () => {
    const gateway = make(
      gatewayWith(null, { data: { user: { id: 'usr_2' }, session: null }, error: null }),
    );

    await expect(
      gateway.signUp({ email: 'a@b.com', password: 'pw', fullName: 'A' }),
    ).resolves.toEqual({ userId: 'usr_2', needsEmailConfirmation: true });
  });

  it('does not flag it when a session is issued', async () => {
    const gateway = make(
      gatewayWith(null, {
        data: { user: { id: 'usr_3' }, session: { access_token: 'redacted' } },
        error: null,
      }),
    );

    await expect(
      gateway.signUp({ email: 'a@b.com', password: 'pw', fullName: 'A' }),
    ).resolves.toEqual({ userId: 'usr_3', needsEmailConfirmation: false });
  });

  it('points the confirmation email at this deployment, not localhost', async () => {
    const client = gatewayWith(null, {
      data: { user: { id: 'usr_4' }, session: null },
      error: null,
    });
    const gateway = make(client);

    await gateway.signUp({ email: 'a@b.com', password: 'pw', fullName: 'A' });

    const options = client.auth.signUp.mock.calls[0]![0].options;
    expect(options.emailRedirectTo).toBe('https://www.findplce.com/auth/callback');
    expect(options.emailRedirectTo).not.toMatch(/localhost/);
  });

  it('still raises a duplicate address as email_taken', async () => {
    const gateway = make(
      gatewayWith(null, { data: { user: null }, error: { message: 'User already registered' } }),
    );

    await expect(
      gateway.signUp({ email: 'a@b.com', password: 'pw', fullName: 'A' }),
    ).rejects.toMatchObject({ code: 'email_taken' });
  });
});

describe('sign up failures', () => {
  const failWith = (error: Record<string, unknown>) =>
    make(gatewayWith(null, { data: { user: null }, error }));

  const attempt = (gateway: ReturnType<typeof make>) =>
    gateway.signUp({ email: 'a@b.com', password: 'pw', fullName: 'A' });

  it('names the shared mail quota instead of advising a retry', async () => {
    // The retry advice was actively harmful here: each attempt consumed
    // another slot against the limit that was already the problem.
    await expect(attempt(failWith({ status: 429, message: 'email rate limit exceeded' })))
      .rejects.toThrow(/wait a few minutes/i);
  });

  it('recognises the throttle by message when there is no status', async () => {
    await expect(
      attempt(failWith({ message: 'For security purposes, you can only request this after 51s' })),
    ).rejects.toThrow(/wait a few minutes/i);
  });

  it('reports a rejected password as such, not as a generic failure', async () => {
    await expect(attempt(failWith({ message: 'Password should be at least 6 characters' })))
      .rejects.toMatchObject({ code: 'weak_password' });
  });

  it('still reports a duplicate address as email_taken', async () => {
    await expect(attempt(failWith({ message: 'User already registered' })))
      .rejects.toMatchObject({ code: 'email_taken' });
  });

  it('recognises a duplicate by code as well as by message', async () => {
    await expect(attempt(failWith({ code: 'user_already_exists', message: 'nope' })))
      .rejects.toMatchObject({ code: 'email_taken' });
  });

  it('says so plainly when signups are closed', async () => {
    await expect(attempt(failWith({ message: 'Signups not allowed for this instance' })))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps a trigger failure generic to the visitor but logged for us', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(attempt(failWith({ status: 500, message: 'Database error saving new user' })))
      .rejects.toThrow(/could not create that account/i);

    // The detail an operator needs must reach the log even though the
    // visitor is told nothing about our schema.
    expect(spy).toHaveBeenCalledWith(
      '[auth] signUp failed',
      expect.stringContaining('Database error saving new user'),
    );
    spy.mockRestore();
  });
});

describe('resend confirmation', () => {
  it('sends a signup confirmation pointed at this deployment', async () => {
    const client = {
      auth: { resend: vi.fn().mockResolvedValue({ error: null }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new SupabaseAuthGateway(client as any);

    await gateway.resendConfirmation('  PlceEHQ@Gmail.com  ');

    const arg = client.auth.resend.mock.calls[0]![0];
    expect(arg.type).toBe('signup');
    expect(arg.email).toBe('plceehq@gmail.com');
    expect(arg.options.emailRedirectTo).toBe('https://www.findplce.com/auth/callback');
  });

  it('stays silent when the address is unknown, so it cannot enumerate accounts', async () => {
    const client = {
      auth: {
        resend: vi.fn().mockResolvedValue({ error: { message: 'User not found' } }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new SupabaseAuthGateway(client as any);

    // Resolves rather than throwing: the caller cannot tell the
    // difference between a sent mail and a missing account.
    await expect(gateway.resendConfirmation('nobody@example.com')).resolves.toBeUndefined();
  });
});

describe('error codes', () => {
  it('keeps the two cases distinguishable to callers', () => {
    const unconfirmed = new AuthError('x', 'email_not_confirmed');
    const wrongPassword = new AuthError('y', 'invalid_credentials');
    expect(unconfirmed.code).not.toBe(wrongPassword.code);
  });
});
