export interface Env {
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  GITHUB_APP_ID: string;
  ALLOWED_USER_IDS: string; // comma-separated
  REPO_OWNER: string;
  REPO_NAME: string;
  BRANCH: string;
  SESSIONS: KVNamespace;
}

const SESSION_TTL = 8 * 60 * 60; // 8 hours

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      ...headers,
    },
  });
}

export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isAllowedUser(userId: number, allowedIds: string): boolean {
  return allowedIds.split(',').map(Number).includes(userId);
}

export async function createSession(kv: KVNamespace, userId: number, accessToken: string): Promise<string> {
  const sessionId = generateState();
  await kv.put(`session:${sessionId}`, JSON.stringify({ userId, accessToken }), { expirationTtl: SESSION_TTL });
  return sessionId;
}

export async function getSession(kv: KVNamespace, request: Request): Promise<{ userId: number; accessToken: string } | null> {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/cms_session=([a-f0-9]+)/);
  if (!match) return null;
  const data = await kv.get(`session:${match[1]}`);
  if (!data) return null;
  return JSON.parse(data);
}

export function setSessionCookie(sessionId: string): string {
  return `cms_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearSessionCookie(): string {
  return 'cms_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}
