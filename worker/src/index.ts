import { Env, jsonResponse, getSession } from './utils';
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    try {
      // Auth routes
      if (path === '/api/auth/login' && request.method === 'GET') {
        return handleLogin(request, env);
      }
      if (path === '/api/auth/callback' && request.method === 'GET') {
        return handleCallback(request, env);
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        return handleLogout(request, env);
      }
      if (path === '/api/user' && request.method === 'GET') {
        return handleGetUser(request, env);
      }

      // Posts routes
      if (path === '/api/posts' && request.method === 'GET') {
        return handleListPosts(request, env);
      }
      if (path === '/api/posts/upload' && request.method === 'POST') {
        // Image upload (matches before /api/posts/:path)
        return handleImageUpload(request, env);
      }
      if (path === '/api/images' && request.method === 'GET') {
        return handleListImages(request, env);
      }
      if (path === '/api/images/upload' && request.method === 'POST') {
        return handleImageUpload(request, env);
      }

      // Posts by path: /api/posts//* (must be after specific routes)
      if (path.startsWith('/api/posts/')) {
        const filePath = decodeURIComponent(path.slice('/api/posts/'.length));
        if (request.method === 'GET') return handleGetPost(request, env, filePath);
        if (request.method === 'PUT') return handleSavePost(request, env, filePath);
        if (request.method === 'DELETE') return handleDeletePost(request, env, filePath);
      }

      // Generic file routes: /api/file/*
      if (path.startsWith('/api/file/')) {
        const filePath = decodeURIComponent(path.slice('/api/file/'.length));
        if (request.method === 'GET') return handleGetFile(request, env, filePath);
        if (request.method === 'PUT') return handleSaveFile(request, env, filePath);
      }

      // Image delete: /api/images/*
      if (path.startsWith('/api/images/') && request.method === 'DELETE') {
        const filePath = decodeURIComponent(path.slice('/api/images/'.length));
        return handleDeleteImage(request, env, filePath);
      }

      // Batch operations
      if (path === '/api/batch' && request.method === 'POST') {
        return handleBatchOperation(request, env);
      }

      // Deploy status
      if (path === '/api/deploy/status' && request.method === 'GET') {
        return handleDeployStatus(request, env);
      }

      // Health check
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok' });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
