var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-aqmyKA/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/utils.ts
var SESSION_TTL = 8 * 60 * 60;
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
__name(jsonResponse, "jsonResponse");
function generateState() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateState, "generateState");
function isAllowedUser(userId, allowedIds) {
  return allowedIds.split(",").map(Number).includes(userId);
}
__name(isAllowedUser, "isAllowedUser");
async function createSession(kv, userId, accessToken) {
  const sessionId = generateState();
  await kv.put(`session:${sessionId}`, JSON.stringify({ userId, accessToken }), { expirationTtl: SESSION_TTL });
  return sessionId;
}
__name(createSession, "createSession");
async function getSession(kv, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/cms_session=([a-f0-9]+)/);
  if (!match)
    return null;
  const data = await kv.get(`session:${match[1]}`);
  if (!data)
    return null;
  return JSON.parse(data);
}
__name(getSession, "getSession");
function setSessionCookie(sessionId) {
  return `cms_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}
__name(setSessionCookie, "setSessionCookie");
function clearSessionCookie() {
  return "cms_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}
__name(clearSessionCookie, "clearSessionCookie");

// src/auth.ts
var GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
var GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
var SITE_URL = "https://alidadei.github.io";
async function handleLogin(request, env) {
  const state = generateState();
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: env.GITHUB_APP_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: ""
  });
  await env.SESSIONS.put(`oauth_state:${state}`, "1", { expirationTtl: 300 });
  return new Response(null, {
    status: 302,
    headers: { Location: `${GITHUB_AUTHORIZE_URL}?${params}` }
  });
}
__name(handleLogin, "handleLogin");
async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }
  const storedState = await env.SESSIONS.get(`oauth_state:${state}`);
  if (!storedState) {
    return new Response("Invalid or expired state", { status: 403 });
  }
  await env.SESSIONS.delete(`oauth_state:${state}`);
  let tokenData;
  try {
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        client_id: env.GITHUB_APP_CLIENT_ID,
        client_secret: env.GITHUB_APP_CLIENT_SECRET || "",
        code
      })
    });
    tokenData = await tokenResponse.json();
  } catch (e) {
    return new Response("Token exchange failed", { status: 502 });
  }
  if (!tokenData.access_token) {
    return new Response(`Token error: ${tokenData.error || "unknown"}`, { status: 400 });
  }
  let userData;
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "yhl-blog-cms"
      }
    });
    userData = await userResponse.json();
  } catch (e) {
    return new Response("Failed to fetch user info", { status: 502 });
  }
  if (!userData.id) {
    return new Response("Invalid user data", { status: 400 });
  }
  if (!isAllowedUser(userData.id, env.ALLOWED_USER_IDS)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${SITE_URL}/zh/admin/?error=unauthorized`,
        "Set-Cookie": clearSessionCookie()
      }
    });
  }
  const sessionId = await createSession(env.SESSIONS, userData.id, tokenData.access_token);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${SITE_URL}/zh/admin/`,
      "Set-Cookie": setSessionCookie(sessionId)
    }
  });
}
__name(handleCallback, "handleCallback");
async function handleLogout(request, env) {
  const session = await getSession(env.SESSIONS, request);
  if (session) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/cms_session=([a-f0-9]+)/);
    if (match) {
      await env.SESSIONS.delete(`session:${match[1]}`);
    }
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${SITE_URL}/zh/admin/`,
      "Set-Cookie": clearSessionCookie()
    }
  });
}
__name(handleLogout, "handleLogout");
async function handleGetUser(request, env) {
  const session = await getSession(env.SESSIONS, request);
  if (!session) {
    return jsonResponse({ authenticated: false }, 401);
  }
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "yhl-blog-cms"
      }
    });
    if (!userResponse.ok) {
      return jsonResponse({ error: "Failed to fetch user info" }, 500);
    }
    const userData = await userResponse.json();
    return jsonResponse({
      authenticated: true,
      user: {
        id: userData.id,
        login: userData.login,
        avatar_url: userData.avatar_url
      }
    });
  } catch (e) {
    return jsonResponse({ error: "Failed to fetch user info" }, 502);
  }
}
__name(handleGetUser, "handleGetUser");

// src/github-api.ts
var GITHUB_API = "https://api.github.com";
function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "yhl-blog-cms"
  };
}
__name(authHeaders, "authHeaders");
async function requireAuth(request, env) {
  const session = await getSession(env.SESSIONS, request);
  if (!session)
    return null;
  return session;
}
__name(requireAuth, "requireAuth");
async function handleListPosts(request, env) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "src/content/posts";
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${path}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to list posts" }, response.status);
  }
  const data = await response.json();
  const allFiles = [];
  for (const item of data) {
    if (item.type === "dir") {
      const subResponse = await fetch(
        `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${item.path}?ref=${env.BRANCH}`,
        { headers: authHeaders(session.accessToken) }
      );
      if (subResponse.ok) {
        const subData = await subResponse.json();
        allFiles.push(...subData.filter((f) => f.name.endsWith(".md")));
      }
    } else if (item.name.endsWith(".md")) {
      allFiles.push(item);
    }
  }
  return jsonResponse(allFiles);
}
__name(handleListPosts, "handleListPosts");
async function handleGetPost(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to get post" }, response.status);
  }
  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ""));
  return jsonResponse({
    name: data.name,
    path: data.path,
    sha: data.sha,
    content
  });
}
__name(handleGetPost, "handleGetPost");
async function handleSavePost(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body.content) {
    return jsonResponse({ error: "Content is required" }, 400);
  }
  const contentBase64 = btoa(unescape(encodeURIComponent(body.content)));
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: update ${filePath}`,
        content: contentBase64,
        sha: body.sha,
        branch: env.BRANCH
      })
    }
  );
  if (!response.ok) {
    const errorData = await response.json();
    return jsonResponse({ error: "Failed to save post", details: errorData }, response.status);
  }
  const data = await response.json();
  return jsonResponse({ sha: data.content.sha, path: filePath });
}
__name(handleSavePost, "handleSavePost");
async function handleDeletePost(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body.sha) {
    return jsonResponse({ error: "SHA is required for deletion" }, 400);
  }
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: "DELETE",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: delete ${filePath}`,
        sha: body.sha,
        branch: env.BRANCH
      })
    }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to delete post" }, response.status);
  }
  return jsonResponse({ success: true });
}
__name(handleDeletePost, "handleDeletePost");
async function handleGetFile(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to get file" }, response.status);
  }
  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ""));
  return jsonResponse({ content, sha: data.sha });
}
__name(handleGetFile, "handleGetFile");
async function handleSaveFile(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const contentBase64 = btoa(unescape(encodeURIComponent(body.content)));
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: body.message || `cms: update ${filePath}`,
        content: contentBase64,
        sha: body.sha,
        branch: env.BRANCH
      })
    }
  );
  if (!response.ok) {
    const errorData = await response.json();
    return jsonResponse({ error: "Failed to save file", details: errorData }, response.status);
  }
  const data = await response.json();
  return jsonResponse({ sha: data.content.sha, path: filePath });
}
__name(handleSaveFile, "handleSaveFile");
async function handleImageUpload(request, env) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) {
    return jsonResponse({ error: "No file provided" }, 400);
  }
  const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return jsonResponse({ error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(", ")}` }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return jsonResponse({ error: "File too large. Maximum size: 5MB" }, 400);
  }
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `public/images/posts/${timestamp}-${safeName}`;
  const arrayBuffer = await file.arrayBuffer();
  const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: `cms: upload image ${safeName}`,
        content: contentBase64,
        branch: env.BRANCH
      })
    }
  );
  if (!response.ok) {
    const errorData = await response.json();
    return jsonResponse({ error: "Failed to upload image", details: errorData }, response.status);
  }
  return jsonResponse({
    path: filePath,
    url: `/images/posts/${timestamp}-${safeName}`,
    markdown: `![${safeName}](/images/posts/${timestamp}-${safeName})`
  });
}
__name(handleImageUpload, "handleImageUpload");
async function handleListImages(request, env) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/public/images/posts?ref=${env.BRANCH}`,
    { headers: authHeaders(session.accessToken) }
  );
  if (!response.ok) {
    if (response.status === 404)
      return jsonResponse([]);
    return jsonResponse({ error: "Failed to list images" }, response.status);
  }
  const data = await response.json();
  const images = data.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.name)).map((f) => ({
    name: f.name,
    path: f.path,
    url: `/images/posts/${f.name}`,
    sha: f.sha,
    size: f.size,
    markdown: `![${f.name}](/images/posts/${f.name})`
  }));
  return jsonResponse(images);
}
__name(handleListImages, "handleListImages");
async function handleDeleteImage(request, env, filePath) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body.sha)
    return jsonResponse({ error: "SHA is required" }, 400);
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${filePath}`,
    {
      method: "DELETE",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({
        message: `cms: delete image ${filePath}`,
        sha: body.sha,
        branch: env.BRANCH
      })
    }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to delete image" }, response.status);
  }
  return jsonResponse({ success: true });
}
__name(handleDeleteImage, "handleDeleteImage");
async function handleDeployStatus(request, env) {
  const session = await requireAuth(request, env);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const response = await fetch(
    `${GITHUB_API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/actions/runs?branch=${env.BRANCH}&per_page=1`,
    { headers: authHeaders(session.accessToken) }
  );
  if (!response.ok) {
    return jsonResponse({ error: "Failed to get deploy status" }, response.status);
  }
  const data = await response.json();
  const run = data.workflow_runs?.[0];
  if (!run) {
    return jsonResponse({ status: "none", message: "No recent deployments" });
  }
  return jsonResponse({
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    url: run.html_url
  });
}
__name(handleDeployStatus, "handleDeployStatus");

// src/batch.ts
var GITHUB_GRAPHQL = "https://api.github.com/graphql";
async function handleBatchOperation(request, env) {
  const session = await getSession(env.SESSIONS, request);
  if (!session)
    return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body.operation) {
    return jsonResponse({ error: "Operation is required" }, 400);
  }
  const additions = (body.files || []).map((f) => ({
    path: f.path,
    contents: btoa(unescape(encodeURIComponent(f.content)))
  }));
  const deletions = (body.deleteFiles || []).map((f) => ({
    path: f.path
  }));
  const query = `
    mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit {
          oid
          url
        }
      }
    }
  `;
  const headOid = await getHeadOid(session.accessToken, env);
  const variables = {
    input: {
      branch: {
        repositoryNameWithOwner: `${env.REPO_OWNER}/${env.REPO_NAME}`,
        branchName: env.BRANCH
      },
      message: {
        headline: body.message || `cms: batch ${body.operation}`
      },
      fileChanges: {
        additions,
        deletions
      },
      expectedHeadOid: headOid
    }
  };
  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "yhl-blog-cms"
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json();
  if (data.errors) {
    return jsonResponse({ error: "GraphQL error", details: data.errors }, 400);
  }
  const commit = data.data?.createCommitOnBranch?.commit;
  return jsonResponse({
    success: true,
    commit: commit ? { oid: commit.oid, url: commit.url } : null
  });
}
__name(handleBatchOperation, "handleBatchOperation");
async function getHeadOid(token, env) {
  const query = `
    query($owner: String!, $name: String!, $branch: String!) {
      repository(owner: $owner, name: $name) {
        ref(qualifiedName: $branch) {
          target {
            oid
          }
        }
      }
    }
  `;
  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "yhl-blog-cms"
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: env.REPO_OWNER,
        name: env.REPO_NAME,
        branch: `refs/heads/${env.BRANCH}`
      }
    })
  });
  const data = await response.json();
  return data.data?.repository?.ref?.target?.oid || "";
}
__name(getHeadOid, "getHeadOid");

// src/index.ts
function wrapCors(handler, request) {
  return handler().then((res) => {
    const headers = new Headers(res.headers);
    const cors = corsHeaders(request);
    for (const [k, v] of Object.entries(cors))
      headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  });
}
__name(wrapCors, "wrapCors");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }
    try {
      if (path === "/api/auth/login" && request.method === "GET") {
        return handleLogin(request, env);
      }
      if (path === "/api/auth/callback" && request.method === "GET") {
        return handleCallback(request, env);
      }
      if (path === "/api/auth/logout" && request.method === "POST") {
        return handleLogout(request, env);
      }
      if (path === "/api/user" && request.method === "GET") {
        return wrapCors(() => handleGetUser(request, env), request);
      }
      if (path === "/api/posts" && request.method === "GET") {
        return wrapCors(() => handleListPosts(request, env), request);
      }
      if (path === "/api/posts/upload" && request.method === "POST") {
        return wrapCors(() => handleImageUpload(request, env), request);
      }
      if (path === "/api/images" && request.method === "GET") {
        return wrapCors(() => handleListImages(request, env), request);
      }
      if (path === "/api/images/upload" && request.method === "POST") {
        return wrapCors(() => handleImageUpload(request, env), request);
      }
      if (path.startsWith("/api/posts/")) {
        const filePath = decodeURIComponent(path.slice("/api/posts/".length));
        if (request.method === "GET")
          return wrapCors(() => handleGetPost(request, env, filePath), request);
        if (request.method === "PUT")
          return wrapCors(() => handleSavePost(request, env, filePath), request);
        if (request.method === "DELETE")
          return wrapCors(() => handleDeletePost(request, env, filePath), request);
      }
      if (path.startsWith("/api/file/")) {
        const filePath = decodeURIComponent(path.slice("/api/file/".length));
        if (request.method === "GET")
          return wrapCors(() => handleGetFile(request, env, filePath), request);
        if (request.method === "PUT")
          return wrapCors(() => handleSaveFile(request, env, filePath), request);
      }
      if (path.startsWith("/api/images/") && request.method === "DELETE") {
        const filePath = decodeURIComponent(path.slice("/api/images/".length));
        return wrapCors(() => handleDeleteImage(request, env, filePath), request);
      }
      if (path === "/api/batch" && request.method === "POST") {
        return wrapCors(() => handleBatchOperation(request, env), request);
      }
      if (path === "/api/deploy/status" && request.method === "GET") {
        return wrapCors(() => handleDeployStatus(request, env), request);
      }
      if (path === "/api/health") {
        return wrapCors(async () => new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" }
        }), request);
      }
      return wrapCors(async () => new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }), request);
    } catch (err) {
      console.error("Worker error:", err);
      return wrapCors(async () => new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }), request);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-aqmyKA/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-aqmyKA/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
