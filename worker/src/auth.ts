import { Env, generateState, isAllowedUser, createSession, setSessionCookie, clearSessionCookie, jsonResponse, getSession } from './utils';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = generateState();
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: env.GITHUB_APP_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: '',
  });

  // Store state in KV for CSRF verification (5 min TTL)
  await env.SESSIONS.put(`oauth_state:${state}`, '1', { expirationTtl: 300 });

  return new Response(null, {
    status: 302,
    headers: { Location: `${GITHUB_AUTHORIZE_URL}?${params}` },
  });
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return jsonResponse({ error: 'Missing code or state' }, 400);
  }

  // Verify state to prevent CSRF
  const storedState = await env.SESSIONS.get(`oauth_state:${state}`);
  if (!storedState) {
    return jsonResponse({ error: 'Invalid or expired state' }, 403);
  }
  await env.SESSIONS.delete(`oauth_state:${state}`);

  // Exchange code for access token
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return jsonResponse({ error: 'Failed to obtain access token', details: tokenData }, 400);
  }

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  const userData = await userResponse.json() as { id: number; login: string; avatar_url?: string };
  if (!userData.id) {
    return jsonResponse({ error: 'Failed to get user info' }, 400);
  }

  // Check if user is allowed
  if (!isAllowedUser(userData.id, env.ALLOWED_USER_IDS)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/admin/?error=unauthorized',
        'Set-Cookie': clearSessionCookie(),
      },
    });
  }

  // Create session
  const sessionId = await createSession(env.SESSIONS, userData.id, tokenData.access_token);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/',
      'Set-Cookie': setSessionCookie(sessionId),
    },
  });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env.SESSIONS, request);
  if (session) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/cms_session=([a-f0-9]+)/);
    if (match) {
      await env.SESSIONS.delete(`session:${match[1]}`);
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}

export async function handleGetUser(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env.SESSIONS, request);
  if (!session) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!userResponse.ok) {
    return jsonResponse({ error: 'Failed to fetch user info' }, 500);
  }

  const userData = await userResponse.json() as { id: number; login: string; avatar_url?: string };
  return jsonResponse({
    authenticated: true,
    user: {
      id: userData.id,
      login: userData.login,
      avatar_url: userData.avatar_url,
    },
  });
}
