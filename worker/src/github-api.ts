import { Env, jsonResponse, getSession } from './utils';

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
}

async function requireAuth(request: Request, env: Env) {
  const session = await getSession(env.SESSIONS, request);
  if (!session) return null;
  return session;
}

export async function handleListPosts(request: Request, env: Env): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const path = url.searchParams.get('path') || 'src/content/posts';

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${path}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to list posts' }, response.status as 400);
  }

  const data = await response.json() as Array<{ name: string; path: string; type: string; sha: string }>;
  // Recursively list subdirectories (zh/, en/)
  const allFiles: Array<{ name: string; path: string; type: string; sha: string }> = [];

  for (const item of data) {
    if (item.type === 'dir') {
      const subResponse = await fetch(
        `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${item.path}?ref=${env.BRANCH}`,
        { headers: authHeaders(session.accessToken) }
      );
      if (subResponse.ok) {
        const subData = await subResponse.json() as Array<{ name: string; path: string; type: string; sha: string }>;
        allFiles.push(...subData.filter(f => f.name.endsWith('.md')));
      }
    } else if (item.name.endsWith('.md')) {
      allFiles.push(item);
    }
  }

  return jsonResponse(allFiles);
}

export async function handleGetPost(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to get post' }, response.status as 400);
  }

  const data = await response.json() as { content: string; sha: string; name: string; path: string };
  const content = atob(data.content.replace(/\n/g, ''));

  return jsonResponse({
    name: data.name,
    path: data.path,
    sha: data.sha,
    content,
  });
}

export async function handleSavePost(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json() as { content: string; sha?: string; message?: string };

  if (!body.content) {
    return jsonResponse({ error: 'Content is required' }, 400);
  }

  const contentBase64 = btoa(unescape(encodeURIComponent(body.content)));

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: update ${filePath}`,
        content: contentBase64,
        sha: body.sha,
        branch: env.BRANCH,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    return jsonResponse({ error: 'Failed to save post', details: errorData }, response.status as 400);
  }

  const data = await response.json() as { content: { sha: string } };
  return jsonResponse({ sha: data.content.sha, path: filePath });
}

export async function handleDeletePost(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json() as { sha: string; message?: string };

  if (!body.sha) {
    return jsonResponse({ error: 'SHA is required for deletion' }, 400);
  }

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: 'DELETE',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: delete ${filePath}`,
        sha: body.sha,
        branch: env.BRANCH,
      }),
    }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to delete post' }, response.status as 400);
  }

  return jsonResponse({ success: true });
}

export async function handleGetFile(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to get file' }, response.status as 400);
  }

  const data = await response.json() as { content: string; sha: string };
  const content = atob(data.content.replace(/\n/g, ''));

  return jsonResponse({ content, sha: data.sha });
}

export async function handleSaveFile(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json() as { content: string; sha?: string; message?: string };

  const contentBase64 = btoa(unescape(encodeURIComponent(body.content)));

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: update ${filePath}`,
        content: contentBase64,
        sha: body.sha,
        branch: env.BRANCH,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    return jsonResponse({ error: 'Failed to save file', details: errorData }, response.status as 400);
  }

  const data = await response.json() as { content: { sha: string } };
  return jsonResponse({ sha: data.content.sha, path: filePath });
}

export async function handleImageUpload(request: Request, env: Env): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return jsonResponse({ error: 'No file provided' }, 400);
  }

  // Validate MIME type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return jsonResponse({ error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}` }, 400);
  }

  // Validate size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return jsonResponse({ error: 'File too large. Maximum size: 5MB' }, 400);
  }

  // Unique filename with timestamp
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `public/images/posts/${timestamp}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: `cms: upload image ${safeName}`,
        content: contentBase64,
        branch: env.BRANCH,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    return jsonResponse({ error: 'Failed to upload image', details: errorData }, response.status as 400);
  }

  return jsonResponse({
    path: filePath,
    url: `/images/posts/${timestamp}-${safeName}`,
    markdown: `![${safeName}](/images/posts/${timestamp}-${safeName})`,
  });
}

export async function handleListImages(request: Request, env: Env): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/public/images/posts?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );

  if (!response.ok) {
    if (response.status === 404) return jsonResponse([]);
    return jsonResponse({ error: 'Failed to list images' }, response.status as 400);
  }

  const data = await response.json() as Array<{ name: string; path: string; sha: string; size: number }>;
  const images = data
    .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f.name))
    .map(f => ({
      name: f.name,
      path: f.path,
      url: `/images/posts/${f.name}`,
      sha: f.sha,
      size: f.size,
      markdown: `![${f.name}](/images/posts/${f.name})`,
    }));

  return jsonResponse(images);
}

export async function handleDeleteImage(request: Request, env: Env, filePath: string): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json() as { sha: string };
  if (!body.sha) return jsonResponse({ error: 'SHA is required' }, 400);

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: 'DELETE',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: `cms: delete image ${filePath}`,
        sha: body.sha,
        branch: env.BRANCH,
      }),
    }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to delete image' }, response.status as 400);
  }

  return jsonResponse({ success: true });
}

export async function handleDeployStatus(request: Request, env: Env): Promise<Response> {
  const session = await requireAuth(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/actions/runs?branch=${env.BRANCH}&per_page=1`,
    { headers: authHeaders(session.accessToken) }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Failed to get deploy status' }, response.status as 400);
  }

  const data = await response.json() as { workflow_runs: Array<{ status: string; conclusion: string; created_at: string; html_url: string }> };
  const run = data.workflow_runs?.[0];

  if (!run) {
    return jsonResponse({ status: 'none', message: 'No recent deployments' });
  }

  return jsonResponse({
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    url: run.html_url,
  });
}
