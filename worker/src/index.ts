import { Env, corsHeaders, corsResponse } from './utils';
import { handleLogin, handleCallback, handleLogout, handleGetUser } from './auth';
import {
  handleListPosts,
  handleGetPost,
  handleSavePost,
  handleDeletePost,
  handleGetFile,
  handleSaveFile,
  handleImageUpload,
  handleListImages,
  handleDeleteImage,
  handleDeployStatus,
} from './github-api';
import { handleBatchOperation } from './batch';

function wrapCors(handler: () => Promise<Response>, request: Request): Promise<Response> {
  return handler().then(res => {
    const headers = new Headers(res.headers);
    const cors = corsHeaders(request);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    try {
      // Auth routes (redirect-based, no CORS needed)
      if (path === '/api/auth/login' && request.method === 'GET') {
        return handleLogin(request, env);
      }
      if (path === '/api/auth/callback' && request.method === 'GET') {
        return handleCallback(request, env);
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        return handleLogout(request, env);
      }

      // API routes (CORS-wrapped)
      if (path === '/api/user' && request.method === 'GET') {
        return wrapCors(() => handleGetUser(request, env), request);
      }
      if (path === '/api/posts' && request.method === 'GET') {
        return wrapCors(() => handleListPosts(request, env), request);
      }
      if (path === '/api/posts/upload' && request.method === 'POST') {
        return wrapCors(() => handleImageUpload(request, env), request);
      }
      if (path === '/api/images' && request.method === 'GET') {
        return wrapCors(() => handleListImages(request, env), request);
      }
      if (path === '/api/images/upload' && request.method === 'POST') {
        return wrapCors(() => handleImageUpload(request, env), request);
      }

      if (path.startsWith('/api/posts/')) {
        const filePath = decodeURIComponent(path.slice('/api/posts/'.length));
        if (request.method === 'GET') return wrapCors(() => handleGetPost(request, env, filePath), request);
        if (request.method === 'PUT') return wrapCors(() => handleSavePost(request, env, filePath), request);
        if (request.method === 'DELETE') return wrapCors(() => handleDeletePost(request, env, filePath), request);
      }

      if (path.startsWith('/api/file/')) {
        const filePath = decodeURIComponent(path.slice('/api/file/'.length));
        if (request.method === 'GET') return wrapCors(() => handleGetFile(request, env, filePath), request);
        if (request.method === 'PUT') return wrapCors(() => handleSaveFile(request, env, filePath), request);
      }

      if (path.startsWith('/api/images/') && request.method === 'DELETE') {
        const filePath = decodeURIComponent(path.slice('/api/images/'.length));
        return wrapCors(() => handleDeleteImage(request, env, filePath), request);
      }

      if (path === '/api/batch' && request.method === 'POST') {
        return wrapCors(() => handleBatchOperation(request, env), request);
      }

      if (path === '/api/deploy/status' && request.method === 'GET') {
        return wrapCors(() => handleDeployStatus(request, env), request);
      }

      if (path === '/api/health') {
        return wrapCors(async () => new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        }), request);
      }

      return wrapCors(async () => new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }), request);
    } catch (err) {
      console.error('Worker error:', err);
      return wrapCors(async () => new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }), request);
    }
  },
} satisfies ExportedHandler<Env>;
