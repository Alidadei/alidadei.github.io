import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = typeof window !== 'undefined'
  ? (window as any).__WORKER_URL__ || 'https://yhl-blog-cms.yuhl.workers.dev'
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

type View = 'posts' | 'editor' | 'tags' | 'categories' | 'images' | 'deploy';

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

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/user');
      const data = await res.json();
      if (data.authenticated) {
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
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setState(s => ({ ...s, authenticated: false, user: null }));
  };

  const navigate = (view: View, editingPath?: string | null) => {
    setState(s => ({ ...s, view, editingPath: editingPath || null }));
  };

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
    <div className="flex min-h-screen">
      <aside className="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">CMS</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <NavItem icon="📝" label="文章" active={state.view === 'posts' || state.view === 'editor'} onClick={() => navigate('posts')} />
          <NavItem icon="🏷️" label="标签" active={state.view === 'tags'} onClick={() => navigate('tags')} />
          <NavItem icon="📁" label="分类" active={state.view === 'categories'} onClick={() => navigate('categories')} />
          <NavItem icon="🖼️" label="图片" active={state.view === 'images'} onClick={() => navigate('images')} />
          <NavItem icon="🚀" label="部署" active={state.view === 'deploy'} onClick={() => navigate('deploy')} />
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            {state.user?.avatar_url && <img src={state.user.avatar_url} alt="" className="w-6 h-6 rounded-full" />}
            <span className="text-sm text-gray-600 dark:text-gray-300">{state.user?.login}</span>
          </div>
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700">退出登录</button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        {state.view === 'posts' && <PostList onEdit={(path) => navigate('editor', path)} />}
        {state.view === 'editor' && <PostEditor filePath={state.editingPath} onBack={() => navigate('posts')} />}
        {state.view === 'tags' && <TagManager />}
        {state.view === 'categories' && <CategoryManager />}
        {state.view === 'images' && <ImageManager />}
        {state.view === 'deploy' && <DeployStatus />}
      </main>
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
    <div className="flex items-center justify-center min-h-screen">
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

function PostList({ onEdit }: { onEdit: (path: string) => void }) {
  const [posts, setPosts] = useState<PostFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/api/posts')
      .then(r => r.json())
      .then(data => { setPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = posts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">文章列表</h2>
        <button
          onClick={() => onEdit(null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          新建文章
        </button>
      </div>

      <input
        type="text"
        placeholder="搜索文章..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      {loading ? (
        <div className="text-gray-500">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">暂无文章</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(post => (
            <div
              key={post.path}
              className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{post.name}</div>
                <div className="text-sm text-gray-500">{post.path}</div>
              </div>
              <button onClick={() => onEdit(post.path)} className="text-blue-600 hover:text-blue-800 text-sm">
                编辑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============= PostEditor =============
interface PostData {
  path: string;
  sha: string;
  content: string;
}

function PostEditor({ filePath, onBack }: { filePath: string | null; onBack: () => void }) {
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (filePath) {
      apiFetch(`/api/posts/${encodeURIComponent(filePath)}`)
        .then(r => r.json())
        .then(data => { setPost(data); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      const now = new Date().toISOString().slice(0, 10);
      setPost({
        path: `src/content/posts/zh/new-post-${Date.now()}.md`,
        sha: '',
        content: `---\ntitle: 新文章\ndate: ${now}\nlang: zh\ncategories: []\ntags: []\ndraft: true\n---\n\n在这里写内容...\n`,
      });
      setLoading(false);
    }
  }, [filePath]);

  const handleSave = async (publish: boolean) => {
    if (!post) return;
    setSaving(true);
    setMessage('');

    const content = publish
      ? post.content.replace(/^draft:\s*true/m, 'draft: false')
      : post.content;

    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(post.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          sha: post.sha || undefined,
          message: publish ? `cms: publish ${post.path}` : `cms: save draft ${post.path}`,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPost(p => p ? { ...p, sha: data.sha, content } : p);
        setMessage(publish ? '已发布' : '已保存');
      } else {
        setMessage(`保存失败: ${data.error || 'Unknown error'} ${data.details?.message || JSON.stringify(data.details) || ''}`);
      }
    } catch {
      setMessage('网络错误');
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!post) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`cms-draft-${post.path}`, post.content);
    }, 2000);
    return () => clearTimeout(timer);
  }, [post?.content, post?.path]);

  if (loading) return <div className="text-gray-500">加载中...</div>;
  if (!post) return <div className="text-red-500">加载失败</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">&larr; 返回</button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{filePath ? '编辑文章' : '新建文章'}</h2>
        </div>
        <div className="flex items-center gap-2">
          {message && <span className="text-sm text-green-600 dark:text-green-400">{message}</span>}
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            {saving ? '保存中...' : '保存草稿'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-500 mb-3">{post.path}</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Markdown</div>
          <textarea
            value={post.content}
            onChange={e => setPost(p => p ? { ...p, content: e.target.value } : p)}
            className="w-full h-[600px] p-4 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            spellCheck={false}
          />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">预览</div>
          <div
            className="w-full h-[600px] p-4 border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-800 prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(post.content) }}
          />
        </div>
      </div>
    </div>
  );
}

function simpleMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
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
