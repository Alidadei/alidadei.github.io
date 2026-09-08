import { Env, jsonResponse, getSession } from './utils';

// 对外「一键隐藏」开关:状态存 KV(复用 SESSIONS 命名空间),无 TTL,直到再次切换。
// 这里只保存开关;真正的拦截在站点前端守卫脚本完成(静态站无法在 Pages 层按访客区分)。
const SITE_MODE_KEY = 'site_mode';

export async function handleGetSiteMode(env: Env): Promise<Response> {
  const hidden = (await env.SESSIONS.get(SITE_MODE_KEY)) === 'hidden';
  return jsonResponse({ hidden });
}

export async function handleSetSiteMode(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env.SESSIONS, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { hidden?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof body.hidden !== 'boolean') {
    return jsonResponse({ error: 'Field "hidden" must be a boolean' }, 400);
  }

  if (body.hidden) {
    await env.SESSIONS.put(SITE_MODE_KEY, 'hidden');
  } else {
    await env.SESSIONS.delete(SITE_MODE_KEY);
  }
  return jsonResponse({ hidden: body.hidden });
}
