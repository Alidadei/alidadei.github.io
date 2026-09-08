import React, { useState, useEffect, useCallback, useRef } from 'react';
import VditorEditor from './VditorEditor';
import { joinFrontmatter, parsePostMeta, setDraftFlag, splitFrontmatter, type PostMeta } from './post-meta';
import { WORKER_URL } from '../../data/site';

const API_BASE = typeof window !== 'undefined'
  ? (window as any).__WORKER_URL__ || WORKER_URL
  : '';

let _sessionToken: string | null = null;

function getSessionToken(): string | null {
  if (_sessionToken) return _sessionToken;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const match = hash.match(/session=([a-f0-9]+)/);
  if (match) {
    _sessionToken = match[1];
    sessionStorage.setItem('cms_session_token', _sessionToken);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return _sessionToken;
  }
  _sessionToken = sessionStorage.getItem('cms_session_token');
  return _sessionToken;
}

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { 'X-Session-Token': token } : {};
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>), ...authHeaders() };
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

type View = 'posts' | 'editor' | 'tags' | 'categories' | 'images' | 'deploy' | 'site';

const NAV: Array<{ view: View; icon: string; label: string }> = [
  { view: 'posts', icon: '📝', label: '文章' },
  { view: 'tags', icon: '🏷️', label: '标签' },
  { view: 'categories', icon: '📁', label: '分类' },
  { view: 'images', icon: '🖼️', label: '图片' },
  { view: 'deploy', icon: '🚀', label: '部署' },
  { view: 'site', icon: '🔒', label: '站点开关' },
];

interface User {
  id: number;
  login: string;
  avatar_url?: string;
}

interface AppState {
  authenticated: boolean | null;
  user: User | null;
  view: View;
  editingPath: string | null;
  error: string | null;
}

export default function AdminApp() {
  const [state, setState] = useState<AppState>({
    authenticated: null,
    user: null,
    view: 'posts',
    editingPath: null,
    error: null,
  });
  const [navOpen, setNavOpen] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/user');
      const data = await res.json();
      if (data.authenticated) {
        // 站点守卫脚本读本标记判定「站长浏览器」,锁站时豁免
        try { localStorage.setItem('cms_owner_at', String(Date.now())); } catch { /* 隐私模式忽略 */ }
        setState(s => ({ ...s, authenticated: true, user: data.user }));
      } else {
        setState(s => ({ ...s, authenticated: false }));
      }
    } catch {
      setState(s => ({ ...s, authenticated: false, error: 'Failed to connect to API' }));
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = () => {
    window.location.href = `${API_BASE}/api/auth/login`;
  };

  const logout = async () => {
    sessionStorage.removeItem('cms_session_token');
    _sessionToken = null;
    try { localStorage.removeItem('cms_owner_at'); } catch { /* 隐私模式忽略 */ }
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setState(s => ({ ...s, authenticated: false, user: null }));
  };

  const navigate = (view: View, editingPath?: string | null) => {
    setState(s => ({ ...s, view, editingPath: editingPath || null }));
    setNavOpen(false);
  };

  const isActive = (view: View) =>
    view === 'posts'
      ? state.view === 'posts' || state.view === 'editor'
      : state.view === view;

  if (state.authenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (!state.authenticated) {
    return <LoginScreen onLogin={login} error={state.error} />;
  }

  return (
    <div className="min-h-screen">
      {/* 移动端顶栏:桌面端隐藏 */}
      <header className="lg:hidden sticky top-0 z-40 flex h-12 items-center justify-between border-b border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="打开菜单"
          className="rounded p-2 -ml-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4.5h16v1.6H2V4.5zm0 4.7h16v1.6H2V9.2zm0 4.7h16v1.6H2v-1.6z" /></svg>
        </button>
        <span className="text-base font-bold text-gray-900 dark:text-white">CMS</span>
        {state.user?.avatar_url
          ? <img src={state.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
          : <span className="w-6" />}
      </header>

      <div className="flex">
        {/* 桌面侧栏 */}
        <aside className="hidden w-56 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">CMS</h1>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {NAV.map(item => (
              <NavItem key={item.view} icon={item.icon} label={item.label} active={isActive(item.view)} onClick={() => navigate(item.view)} />
            ))}
          </nav>
          <div className="border-t border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-2 flex items-center gap-2">
              {state.user?.avatar_url && <img src={state.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />}
              <span className="text-sm text-gray-600 dark:text-gray-300">{state.user?.login}</span>
            </div>
            <button onClick={logout} className="text-xs text-red-500 hover:text-red-700">退出登录</button>
          </div>
        </aside>

        {/* 移动端抽屉导航 */}
        {navOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <nav className="absolute left-0 top-0 flex h-full w-64 max-w-[80vw] flex-col bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
                <span className="text-lg font-bold text-gray-900 dark:text-white">CMS</span>
                <button
                  onClick={() => setNavOpen(false)}
                  aria-label="关闭菜单"
                  className="rounded p-1 text-xl leading-none text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 space-y-1 p-2">
                {NAV.map(item => (
                  <NavItem key={item.view} icon={item.icon} label={item.label} active={isActive(item.view)} onClick={() => navigate(item.view)} />
                ))}
              </div>
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-2 flex items-center gap-2">
                  {state.user?.avatar_url && <img src={state.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />}
                  <span className="text-sm text-gray-600 dark:text-gray-300">{state.user?.login}</span>
                </div>
                <button onClick={logout} className="text-xs text-red-500 hover:text-red-700">退出登录</button>
              </div>
            </nav>
          </div>
        )}

        <main className="w-full min-w-0 flex-1 overflow-auto p-4 pb-10 sm:p-6">
          {state.view === 'posts' && <PostList onEdit={(path) => navigate('editor', path)} />}
          {state.view === 'editor' && <PostEditor filePath={state.editingPath} onBack={() => navigate('posts')} />}
          {state.view === 'tags' && <TagManager />}
          {state.view === 'categories' && <CategoryManager />}
          {state.view === 'images' && <ImageManager />}
          {state.view === 'deploy' && <DeployStatus />}
          {state.view === 'site' && <SiteLock />}
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
        active
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ============= LoginScreen =============
function LoginScreen({ onLogin, error }: { onLogin: () => void; error: string | null }) {
  const urlError = typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('error') : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">博客管理后台</h1>
        {(urlError === 'unauthorized') && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
            你没有访问权限
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
            {error}
          </div>
        )}
        <button
          onClick={onLogin}
          className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-lg hover:opacity-90 flex items-center justify-center gap-2 font-medium"
        >
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          使用 GitHub 登录
        </button>
      </div>
    </div>
  );
}

// ============= PostList =============
interface PostFile {
  name: string;
  path: string;
  type: string;
  sha: string;
}

// 小并发限流,避免一次性打满 GitHub Contents API
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function PostList({ onEdit }: { onEdit: (path: string) => void }) {
  const [posts, setPosts] = useState<PostFile[]>([]);
  const [metas, setMetas] = useState<Record<string, PostMeta>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadPosts = useCallback(() => {
    setLoading(true);
    apiFetch('/api/posts')
      .then(r => r.json())
      .then(async (data) => {
        const list: PostFile[] = Array.isArray(data) ? data : [];
        setPosts(list);
        // 列表接口只有文件名,标题/日期/草稿状态需逐篇读 frontmatter
        const pairs = await mapLimit(list, 8, async (p: PostFile) => {
          try {
            const res = await apiFetch(`/api/posts/${encodeURIComponent(p.path)}`);
            const d = await res.json();
            return [p.path, parsePostMeta(d.content || '')] as const;
          } catch {
            return [p.path, null] as const;
          }
        });
        const map: Record<string, PostMeta> = {};
        for (const [p, meta] of pairs) if (meta) map[p] = meta;
        setMetas(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleDelete = async (post: PostFile) => {
    if (!confirm(`确定删除 ${post.name}？此操作不可恢复。`)) return;
    setBusy(post.path);
    setMessage('');
    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: post.sha, message: `cms: delete ${post.name}` }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('已删除,构建约 2-3 分钟后生效');
        loadPosts();
      } else {
        setMessage(`删除失败: ${data.error} ${data.details?.message || ''}`);
      }
    } catch {
      setMessage('网络错误');
    }
    setBusy(null);
  };

  // 隐藏/恢复 = 行级改写 frontmatter 的 draft 字段,文章文件保留在仓库里
  const handleToggleHide = async (post: PostFile, currentDraft: boolean) => {
    setBusy(post.path);
    setMessage('');
    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取失败');
      const newContent = setDraftFlag(data.content, !currentDraft);
      const put = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          sha: data.sha,
          message: `${currentDraft ? 'cms: unhide' : 'cms: hide'} ${post.name}`,
        }),
      });
      const putData = await put.json();
      if (!put.ok) throw new Error(putData.details?.message || putData.error || '保存失败');
      setMetas(m => ({ ...m, [post.path]: { ...m[post.path], draft: !currentDraft } }));
      setMessage(currentDraft ? '已恢复显示,构建约 2-3 分钟后生效' : '已隐藏(文章保留为草稿),构建约 2-3 分钟后生效');
    } catch (e) {
      setMessage(`操作失败: ${e instanceof Error ? e.message : '网络错误'}`);
    }
    setBusy(null);
  };

  const filtered = posts.filter(p => {
    const q = search.toLowerCase();
    const title = metas[p.path]?.title || '';
    return p.name.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">文章列表</h2>
        <button
          onClick={() => onEdit(null)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          新建文章
        </button>
      </div>

      <input
        type="text"
        placeholder="搜索文件名或标题..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />

      {message && (
        <div className="mb-4 rounded p-3 text-sm text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">暂无文章</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(post => {
            const meta = metas[post.path];
            return (
              <div
                key={post.path}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium break-words text-gray-900 dark:text-white">
                    {meta?.title || post.name}
                    {meta?.draft && (
                      <span className="ml-2 rounded px-2 py-0.5 text-xs text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300">
                        已隐藏
                      </span>
                    )}
                  </div>
                  <div className="text-sm break-all text-gray-500">
                    {post.name}{meta?.date ? ` · ${meta.date}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-3">
                  <button onClick={() => onEdit(post.path)} className="text-sm text-blue-600 hover:text-blue-800">
                    编辑
                  </button>
                  {meta && (
                    <button
                      onClick={() => handleToggleHide(post, meta.draft)}
                      disabled={busy === post.path}
                      className="text-sm text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                    >
                      {busy === post.path ? '处理中...' : meta.draft ? '恢复显示' : '隐藏'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(post)}
                    disabled={busy === post.path}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {busy === post.path ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============= PostEditor =============
function PostEditor({ filePath, onBack }: { filePath: string | null; onBack: () => void }) {
  const [path, setPath] = useState('');
  const [sha, setSha] = useState('');
  const [fm, setFm] = useState('');
  const [initialBody, setInitialBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fmRef = useRef('');
  fmRef.current = fm;
  const bodyRef = useRef('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (filePath) {
      apiFetch(`/api/posts/${encodeURIComponent(filePath)}`)
        .then(r => r.json())
        .then(data => {
          const { fm: f, body } = splitFrontmatter(data.content || '');
          setPath(data.path);
          setSha(data.sha);
          setFm(f ?? '');
          setInitialBody(body);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      const now = new Date().toISOString().slice(0, 10);
      setPath(`src/content/posts/zh/new-post-${Date.now()}.md`);
      setFm(`title: 新文章\ndate: ${now}\nlang: zh\ncategories: []\ntags:\ndraft: true`);
      setInitialBody('在这里写正文...');
      setLoading(false);
    }
  }, [filePath]);

  const buildContent = () => joinFrontmatter(fmRef.current || null, bodyRef.current);

  const scheduleAutosave = useCallback(() => {
    if (!path) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(`cms-draft-${path}`, joinFrontmatter(fmRef.current || null, bodyRef.current));
    }, 2000);
  }, [path]);

  const handleBodyChange = (md: string) => {
    bodyRef.current = md;
    scheduleAutosave();
  };

  const handleSave = async (publish: boolean) => {
    if (!path) return;
    setSaving(true);
    setMessage('');

    let content = buildContent();
    if (publish) content = setDraftFlag(content, false);

    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          sha: sha || undefined,
          message: publish ? `cms: publish ${path}` : `cms: save ${path}`,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSha(data.sha);
        setFm(splitFrontmatter(content).fm ?? '');
        setMessage(publish ? '已发布,构建约 2-3 分钟后生效' : '已保存,构建约 2-3 分钟后生效');
      } else {
        setMessage(`保存失败: ${data.error || 'Unknown error'} ${data.details?.message || JSON.stringify(data.details) || ''}`);
      }
    } catch {
      setMessage('网络错误');
    }
    setSaving(false);
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/images/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data.markdown;
  };

  if (loading) return <div className="text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">&larr; 返回</button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{filePath ? '编辑文章' : '新建文章'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {message && <span className="text-sm text-green-600 dark:text-green-400">{message}</span>}
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {saving ? '保存中...' : '保存草稿'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </div>

      <div className="mb-3 text-sm break-all text-gray-500">{path}</div>

      <details className="mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <summary className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          Frontmatter(标题 / 日期 / 分类 / 标签 / draft)
        </summary>
        <textarea
          value={fm}
          onChange={e => { setFm(e.target.value); scheduleAutosave(); }}
          className="w-full p-4 border-t border-gray-200 dark:border-gray-700 rounded-b-lg font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          rows={10}
          spellCheck={false}
        />
      </details>

      <VditorEditor
        key={path}
        initialValue={initialBody}
        onChange={handleBodyChange}
        onUploadImage={handleUploadImage}
      />
    </div>
  );
}

// ============= TagManager =============
function TagManager() {
  const [posts, setPosts] = useState<PostFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagMap, setTagMap] = useState<Record<string, number>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    apiFetch('/api/posts')
      .then(r => r.json())
      .then(async (data: PostFile[]) => {
        setPosts(data);
        const tags: Record<string, number> = {};
        for (const post of data) {
          try {
            const res = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`);
            const postData = await res.json();
            const content = postData.content || '';
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (fmMatch) {
              const tagsMatch = fmMatch[1].match(/tags:\s*\[(.+?)\]/);
              if (tagsMatch) {
                tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).forEach(t => {
                  if (t) tags[t] = (tags[t] || 0) + 1;
                });
              }
            }
          } catch { /* skip */ }
        }
        setTagMap(tags);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRename = async (oldTag: string) => {
    if (!newName) return;
    const files: Array<{ path: string; content: string }> = [];
    for (const post of posts) {
      try {
        const res = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`);
        const data = await res.json();
        if (data.content?.includes(oldTag)) {
          const newContent = data.content.replace(
            new RegExp(`tags:\\s*\\[([^\\]]*?)\\]`),
            (_, inner) => `tags: [${inner.replace(oldTag, newName)}]`
          );
          if (newContent !== data.content) {
            files.push({ path: post.path, content: newContent });
          }
        }
      } catch { /* skip */ }
    }

    if (files.length > 0) {
      await apiFetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'renameTag', files, message: `cms: rename tag "${oldTag}" to "${newName}"` }),
      });
    }
    setRenaming(null);
    setNewName('');
  };

  if (loading) return <div className="text-gray-500">加载中...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">标签管理</h2>
      <div className="space-y-2">
        {Object.entries(tagMap).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
          <div key={tag} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {renaming === tag ? (
              <div className="flex items-center gap-2 flex-1">
                <input value={newName} onChange={e => setNewName(e.target.value)} className="px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                <button onClick={() => handleRename(tag)} className="text-green-600 text-sm">确认</button>
                <button onClick={() => setRenaming(null)} className="text-gray-500 text-sm">取消</button>
              </div>
            ) : (
              <>
                <span className="text-gray-900 dark:text-white">{tag}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{count} 篇</span>
                  <button onClick={() => { setRenaming(tag); setNewName(tag); }} className="text-blue-600 text-sm">重命名</button>
                </div>
              </>
            )}
          </div>
        ))}
        {Object.keys(tagMap).length === 0 && <div className="text-gray-500">暂无标签</div>}
      </div>
    </div>
  );
}

// ============= CategoryManager =============
function CategoryManager() {
  const [categories, setCategories] = useState<string | null>(null);
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiFetch('/api/file/src/data/categories.json')
      .then(r => r.json())
      .then(data => { setCategories(data.content); setSha(data.sha); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!categories) return;
    setSaving(true);
    setMessage('');

    try {
      const res = await apiFetch('/api/file/src/data/categories.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: categories, sha, message: 'cms: update categories.json' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSha(data.sha);
        setMessage('已保存');
      } else {
        setMessage(`保存失败: ${data.error}`);
      }
    } catch {
      setMessage('网络错误');
    }
    setSaving(false);
  };

  if (loading) return <div className="text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">分类管理</h2>
        <div className="flex items-center gap-2">
          {message && <span className="text-sm text-green-600 dark:text-green-400">{message}</span>}
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3">直接编辑 categories.json（保存后自动触发重新构建）</p>
      <textarea
        value={categories || ''}
        onChange={e => setCategories(e.target.value)}
        className="w-full h-[500px] p-4 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
        spellCheck={false}
      />
    </div>
  );
}

// ============= ImageManager =============
interface ImageItem {
  name: string;
  path: string;
  url: string;
  sha: string;
  size: number;
  markdown: string;
}

function ImageManager() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const loadImages = () => {
    apiFetch('/api/images')
      .then(r => r.json())
      .then(data => { setImages(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadImages(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`上传成功: ${data.markdown}`);
        navigator.clipboard?.writeText(data.markdown);
        loadImages();
      } else {
        setMessage(`上传失败: ${data.error}`);
      }
    } catch {
      setMessage('网络错误');
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (img: ImageItem) => {
    if (!confirm(`确定删除 ${img.name}？`)) return;
    await apiFetch(`/api/images/${encodeURIComponent(img.path)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: img.sha }),
    });
    loadImages();
  };

  const copyMarkdown = (md: string) => {
    navigator.clipboard?.writeText(md);
    setMessage('已复制');
  };

  if (loading) return <div className="text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">图片管理</h2>
        <label className={`px-4 py-2 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700 ${uploading ? 'opacity-50' : ''}`}>
          {uploading ? '上传中...' : '上传图片'}
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {message && <div className="mb-3 text-sm text-green-600 dark:text-green-400">{message}</div>}

      {images.length === 0 ? (
        <div className="text-gray-500">暂无图片</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map(img => (
            <div key={img.path} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <img src={img.url} alt={img.name} className="max-w-full max-h-full object-contain" />
              </div>
              <div className="p-2">
                <div className="text-xs text-gray-500 truncate">{img.name}</div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => copyMarkdown(img.markdown)} className="text-xs text-blue-600">复制</button>
                  <button onClick={() => handleDelete(img)} className="text-xs text-red-600">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============= DeployStatus =============
interface DeployInfo {
  status: string;
  conclusion: string | null;
  created_at: string;
  url: string;
}

function DeployStatus() {
  const [deploy, setDeploy] = useState<DeployInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/deploy/status')
      .then(r => r.json())
      .then(data => { setDeploy(data.status !== 'none' ? data : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statusLabel = (s: string, c: string | null) => {
    if (s === 'completed' && c === 'success') return { text: '部署成功', color: 'text-green-600' };
    if (s === 'completed' && c === 'failure') return { text: '部署失败', color: 'text-red-600' };
    if (s === 'in_progress' || s === 'queued') return { text: '构建中...', color: 'text-yellow-600' };
    return { text: s, color: 'text-gray-500' };
  };

  if (loading) return <div className="text-gray-500">加载中...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">部署状态</h2>
      {deploy ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className={`text-lg font-medium ${statusLabel(deploy.status, deploy.conclusion).color}`}>
            {statusLabel(deploy.status, deploy.conclusion).text}
          </div>
          <div className="text-sm text-gray-500 mt-1">{new Date(deploy.created_at).toLocaleString('zh-CN')}</div>
          <a href={deploy.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
            查看详情 →
          </a>
        </div>
      ) : (
        <div className="text-gray-500">暂无部署记录</div>
      )}
    </div>
  );
}

// ============= SiteLock(对外一键隐藏/恢复) =============
function SiteLock() {
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/site-mode')
      .then(r => r.json())
      .then(d => setHidden(!!d.hidden))
      .catch(() => { setHidden(false); setMessage({ ok: false, text: '读取开关状态失败(网络错误)' }); });
  }, []);

  const toggle = async () => {
    const next = !hidden;
    if (next && !confirm(
      '确定对外隐藏全部内容吗?\n\n' +
      '隐藏后,访客打开本站只能看到首页的星空 3D 动画和每日一句,\n' +
      '其余页面没有入口,直接访问也会跳回首页。\n' +
      '你本人(已登录本管理后台的浏览器)不受影响,可正常浏览和开发。'
    )) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/site-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setHidden(!!data.hidden);
        setMessage({ ok: true, text: next ? '已对外隐藏,访客侧立即生效' : '已恢复显示,访客侧立即生效' });
      } else {
        setMessage({ ok: false, text: `操作失败: ${data.error || '未知错误'}` });
      }
    } catch {
      setMessage({ ok: false, text: '网络错误' });
    }
    setBusy(false);
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">站点开关(对外一键隐藏)</h2>
      <div className="max-w-xl bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-block h-3 w-3 rounded-full ${hidden ? 'bg-red-500' : 'bg-green-500'}`} />
          <span className="text-lg font-medium text-gray-900 dark:text-white">
            {hidden === null ? '状态读取中...' : hidden ? '当前状态:对外隐藏中' : '当前状态:正常开放'}
          </span>
        </div>

        <ul className="mb-5 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
          <li>隐藏后,访客只能看到首页的星空 3D 动画和每日一句。</li>
          <li>导航、博客、项目、关于等页面没有入口,直接输入网址也会跳回首页。</li>
          <li>你自己不受影响:已登录过本后台的浏览器仍可正常浏览全站。</li>
          <li>管理后台 /zh/admin/ 始终可达,用于点击「恢复显示」。</li>
          <li>访客侧立即生效,不需要重新构建部署。</li>
        </ul>

        {message && (
          <div className={`mb-4 rounded p-3 text-sm ${message.ok
            ? 'text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300'
            : 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300'}`}>
            {message.text}
          </div>
        )}

        <button
          onClick={toggle}
          disabled={busy || hidden === null}
          className={`w-full px-4 py-3 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${hidden ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {busy ? '处理中...' : hidden ? '恢复显示(对外全部复原)' : '一键隐藏内容(对外只留首页星空)'}
        </button>

        <p className="mt-3 text-xs text-gray-400">
          提示:这是访客视角的软隐藏(静态站的公开页面技术上仍可被直接抓取),用于临时闭站,不作为内容保护手段。
        </p>
      </div>
    </div>
  );
}
