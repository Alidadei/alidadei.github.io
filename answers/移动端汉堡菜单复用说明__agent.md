# ANSWER.md

当前对话仓库：`R:\Project\TOYS\alidadei.github.io`

当前输出文件：`answers/alidadei.github.io_ANSWER__移动端汉堡菜单复用说明__agent.md`

当前 session：`agent`

## 暂存区

暂无。

## 本轮回答区

# 当前移动端汉堡菜单复用说明

当前实现位于 `src/components/layout/Header.astro`。它的核心效果是：手机端顶部导航始终贴在视口顶端；菜单展开在页面内容上方，不参与正文布局、不向下挤压内容；即使已经向下阅读文章，展开菜单仍然出现在视口顶部；菜单没有任何背景色，只保留 8px 毛玻璃模糊。

## 1. 响应式范围

| 项目 | 当前设置 | 实际效果 |
| --- | --- | --- |
| 手机端断点 | `md:hidden` | 视口宽度小于 `48rem`，即小于 768px 时显示汉堡按钮和手机菜单 |
| 桌面端 | `hidden md:flex` | 768px 及以上隐藏汉堡按钮，显示桌面导航 |
| 已测试宽度 | 320、360、375、390、412、430px | 常见手机宽度均通过自动化检查 |

## 2. 顶部导航容器

```html
<header class="sticky top-0 z-[60] md:z-50 bg-transparent">
  <div class="flex items-center justify-between h-16 px-6 sm:px-8 lg:px-12 bg-transparent backdrop-blur-sm">
    ...
  </div>
</header>
```

具体设置：

| 设置 | 实际值 | 作用 |
| --- | --- | --- |
| `sticky top-0` | 顶部偏移 0 | 页面下拉后，顶部导航仍停留在视口顶端 |
| `z-[60]` | 手机端层级 60 | 整个手机导航位于正文和博客目录组件之上 |
| `md:z-50` | 桌面端层级 50 | 768px 以上恢复为层级 50 |
| `h-16` | 64px | 顶栏固定高度；菜单的 `top-16` 必须与它一致 |
| `bg-transparent` | `rgba(0, 0, 0, 0)` | 顶栏没有背景颜色 |
| `backdrop-blur-sm` | 8px | 顶栏后面的页面内容会被模糊 |
| `px-6` | 左右各 24px | 小于 640px 时的水平内边距 |
| `sm:px-8` | 左右各 32px | 640px 至 767px 时的水平内边距 |

层级关系是：手机端 `header` 为 60，博客目录侧栏为 50、目录遮罩为 45、目录球为 40。因此汉堡按钮和展开菜单会显示在博客目录组件上方。

## 3. 汉堡按钮

当前类名：

```html
<button
  id="mobile-menu-btn"
  class="md:hidden relative z-10 p-2.5 rounded-md text-[#8D6E63] hover:bg-bg-secondary touch-manipulation"
  aria-label="Toggle menu"
  aria-controls="mobile-menu"
  aria-expanded="false"
>
  <svg class="w-5 h-5 pointer-events-none" ...>...</svg>
</button>
```

| 项目 | 当前设置 | 实际效果 |
| --- | --- | --- |
| 点击区域 | `p-2.5` + `w-5 h-5` | 10px 内边距 + 20px 图标，最终点击区约为 40×40px |
| 圆角 | `rounded-md` | 6px 圆角 |
| 图标颜色 | `#8D6E63` | 浏览器计算值为 `rgb(141, 110, 99)` |
| 常态背景 | 未设置填充色 | 当前构建中为透明 |
| 悬停背景 | `hover:bg-bg-secondary` | 使用主题色 `#F3ECE2` |
| 按钮内部层级 | `relative z-10` | 保证按钮建立明确的定位层级 |
| 触摸行为 | `touch-manipulation` | 使用 `touch-action: manipulation`，减少触摸手势歧义 |
| 图标尺寸 | `w-5 h-5` | 20×20px |
| 图标线宽 | `stroke-width="2"` | 2 个 SVG 用户单位 |
| 图标端点 | `round` | 汉堡线条和关闭叉号均使用圆角端点、圆角连接 |
| 图标命中 | `pointer-events-none` | 点击图标正中央时，命中目标仍是按钮本身，不会被 SVG 截获 |

按钮本身没有设置过渡类，所以悬停背景变化是即时的。展开时，内部 SVG 会立即从三条横线替换为关闭叉号；折叠时换回汉堡图标。

## 4. 展开菜单

当前类名：

```html
<nav
  id="mobile-menu"
  class="md:hidden fixed inset-x-0 top-16 z-20 overflow-hidden transition-all duration-300 ease-in-out px-6 sm:px-8 lg:px-12 bg-transparent backdrop-blur-sm"
  style="max-height: 0; opacity: 0;"
>
  ...
</nav>
```

| 项目 | 当前设置 | 实际效果 |
| --- | --- | --- |
| 定位 | `fixed` | 相对视口定位，不进入普通文档流，因此不会挤压首页或文章内容 |
| 水平范围 | `inset-x-0` | 左右都贴住视口边缘，宽度等于视口宽度 |
| 顶部位置 | `top-16` | 从视口顶部 64px 处开始，正好接在顶栏下面 |
| 菜单内部层级 | `z-20` | 位于同一 `header` 内；整个 `header` 又处于手机端 60 层级 |
| 背景颜色 | `bg-transparent` | 完全无色，没有 `/60`、`/90` 等背景不透明度 |
| 背景模糊 | `backdrop-blur-sm` | 8px 毛玻璃模糊 |
| 折叠状态 | `max-height: 0; opacity: 0` | 高度收起且不可见 |
| 展开状态 | `max-height: 300px; opacity: 1` | 最多展开 300px，整个菜单元素完全可见 |
| 动画 | `transition-all duration-300 ease-in-out` | 高度和透明度在 300ms 内缓入缓出 |
| 内容裁切 | `overflow-hidden` | 动画过程中超出当前高度的内容不会露出 |

这里需要区分两个概念：

- 展开时的 `opacity: 1` 是菜单整体的显隐状态。
- 菜单背景仍然是 `transparent`，背景颜色的不透明度始终为 0。

因此当前视觉是“完全无色的透明层 + 8px 背景模糊”，不是 60% 或 90% 的有色背景。

## 5. 菜单文字与间距

普通导航项：

```html
class="block px-3 py-3 text-base font-bold rounded-md text-[#8D6E63] transition-opacity"
```

语言切换项：

```html
class="block px-3 py-3 text-base font-semibold text-[#8D6E63] hover:opacity-80 transition-opacity"
```

| 项目 | 当前设置 |
| --- | --- |
| 字号 | `text-base`，16px |
| 主导航字重 | `font-bold`，700 |
| 语言切换字重 | `font-semibold`，600 |
| 文字颜色 | `#8D6E63` |
| 单项水平内边距 | `px-3`，左右各 12px |
| 单项垂直内边距 | `py-3`，上下各 12px |
| 单项圆角 | `rounded-md`，6px |
| 非当前页悬停 | `opacity: 0.8` |
| 当前页 | 保持同色、粗体、完整不透明度，没有额外背景色 |

当前中英文导航各有 5 个主链接，再加 1 个语言切换链接。按当前 16px 字号、24px 行高和上下各 12px 内边距计算，内容总高度为 288px，低于 300px 的展开上限。

## 6. 交互状态

当前脚本维护一个 `menuOpen` 布尔值，并实现以下行为：

1. 点击汉堡按钮：在展开和折叠之间切换。
2. 展开时：`max-height` 变为 `300px`、`opacity` 变为 `1`、图标变为关闭叉号、`aria-expanded` 变为 `true`。
3. 再次点击按钮：执行统一的 `closeMenu()`。
4. 点击任一菜单链接：先关闭菜单，再进行页面跳转。
5. 点击菜单和按钮以外的任意区域：关闭菜单。
6. 点击按钮或菜单内部：不会被“点击外部关闭”逻辑误判。

页面滚动没有被锁定。脚本没有修改 `document.body.style.overflow`，因此：

- 展开菜单不会让正文跳动。
- 页面仍可滚动。
- 当前滚动位置不会因为打开或关闭菜单而改变。
- 下拉阅读文章后再点击汉堡按钮，菜单仍固定显示在视口顶部 64px 以下。

页面也没有全屏菜单遮罩；菜单之外仍是原页面。点击外部区域会关闭菜单，同时底层被点击元素仍可能执行自己的默认行为。

## 7. 可访问性设置

| 设置 | 当前作用 |
| --- | --- |
| 原生 `<button>` | 支持键盘 Enter/Space 激活 |
| `aria-label="Toggle menu"` | 为无文字图标提供名称 |
| `aria-controls="mobile-menu"` | 声明按钮控制哪个菜单 |
| `aria-expanded` | 折叠为 `false`，展开为 `true` |

当前尚未实现的行为也需要记录：

- 没有按 Escape 键关闭菜单。
- 没有焦点陷阱，也不会在展开后自动聚焦第一个链接。
- 没有在窗口跨过 768px 断点时主动重置 `menuOpen`。
- 不会在滚动页面时自动关闭菜单。

这些不是当前故障，只是复用时需要知道的现状。

## 8. 复用时不能漏掉的关键点

1. `h-16` 与 `top-16` 必须同步；顶栏高度改动后，菜单顶部偏移也要一起改。
2. 菜单必须使用 `fixed`，否则它会回到文档流并挤压正文。
3. 手机端父级 `header` 的层级必须高于页面中的其他浮层；当前是 60。
4. 两个动态 SVG 字符串以及初始 SVG 都要保留 `pointer-events-none`，否则无法保证图标中心始终由按钮命中。
5. 不要恢复 `document.body.style.overflow = 'hidden'`，否则会重新锁住页面滚动。
6. `bg-transparent` 与 `opacity` 不是同一件事；想保持当前无色效果，必须保留透明背景。
7. 如果导航项增加，硬编码的 `300px` 可能裁切内容；届时应同步增大上限，或改为根据 `menu.scrollHeight` 动态计算。
8. 复用脚本时要同时复制 `aria-expanded` 的更新逻辑和点击外部关闭逻辑。

## 9. 当前实现的最小骨架

```html
<header class="sticky top-0 z-[60] md:z-50 bg-transparent">
  <div class="flex items-center justify-between h-16 px-6 sm:px-8 bg-transparent backdrop-blur-sm">
    <div><!-- Logo --></div>

    <button
      id="mobile-menu-btn"
      class="md:hidden relative z-10 p-2.5 rounded-md text-[#8D6E63] hover:bg-bg-secondary touch-manipulation"
      aria-label="Toggle menu"
      aria-controls="mobile-menu"
      aria-expanded="false"
    >
      <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </div>

  <nav
    id="mobile-menu"
    class="md:hidden fixed inset-x-0 top-16 z-20 overflow-hidden transition-all duration-300 ease-in-out px-6 sm:px-8 bg-transparent backdrop-blur-sm"
    style="max-height: 0; opacity: 0;"
  >
    <a class="block px-3 py-3 text-base font-bold rounded-md text-[#8D6E63] hover:opacity-80 transition-opacity" href="#">
      菜单项
    </a>
  </nav>
</header>
```

```js
const btn = document.getElementById('mobile-menu-btn');
const menu = document.getElementById('mobile-menu');
const hamburgerSVG = `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>`;
const closeSVG = `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`;
let menuOpen = false;

function closeMenu() {
  menuOpen = false;
  if (menu) {
    menu.style.maxHeight = '0';
    menu.style.opacity = '0';
  }
  if (btn) {
    btn.innerHTML = hamburgerSVG;
    btn.setAttribute('aria-expanded', 'false');
  }
}

btn?.addEventListener('click', () => {
  menuOpen = !menuOpen;
  if (!menuOpen) {
    closeMenu();
    return;
  }

  if (menu) {
    menu.style.maxHeight = '300px';
    menu.style.opacity = '1';
  }
  if (btn) {
    btn.innerHTML = closeSVG;
    btn.setAttribute('aria-expanded', 'true');
  }
});

menu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeMenu);
});

document.addEventListener('click', (event) => {
  if (!menuOpen || !(event.target instanceof Node)) return;
  if (btn?.contains(event.target) || menu?.contains(event.target)) return;
  closeMenu();
});
```

## 10. 对应验证

回归测试位于 `tests/inspect-mobile-toc.mjs`，当前会验证：

- 汉堡按钮中心没有被其他元素覆盖。
- 按钮与菜单文字颜色都是 `rgb(141, 110, 99)`。
- 菜单是 `fixed` 定位。
- 展开菜单不会改变首页或文章内容的位置。
- 页面下拉后，顶部导航仍位于 0px，菜单仍从 64px 开始。
- 菜单位于博客目录面板之上。
- 点击菜单外部可以关闭。
- 打开菜单不会改变当前页面滚动位置。

当前生产构建已通过，共生成 45 个页面。
