// 为 portfolio 项目生成 SVG 风格封面 → public/images/<slug>.webp
// 用法: node scripts/gen-portfolio-covers.mjs
// 改标题/配色后重跑即可再生成。sharp 直接渲染 SVG(含中文,走系统字体)。
import path from 'node:path';
import sharp from 'sharp';

const W = 1200, H = 420;
const FONT = `'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif`;

// 通用封面框架:渐变底 + 右侧插画 + 左侧文字块(垂直居中,适配卡片 object-cover 裁切)
function frame({ bgFrom, bgTo, titleEn, titleZh, subtitle, art }) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bgFrom}"/><stop offset="1" stop-color="${bgTo}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 60}" cy="50" r="130" fill="#ffffff" opacity="0.05"/>
  <circle cx="80" cy="${H - 30}" r="100" fill="#ffffff" opacity="0.05"/>
  ${art}
  <text x="72" y="168" font-family="${FONT}" font-size="52" font-weight="700" fill="#ffffff">${titleEn}</text>
  ${titleZh ? `<text x="72" y="228" font-family="${FONT}" font-size="30" fill="#ffffff" opacity="0.92">${titleZh}</text>` : ''}
  <text x="72" y="286" font-family="${FONT}" font-size="21" fill="#ffffff" opacity="0.72">${subtitle}</text>
  <rect x="72" y="${titleZh ? 316 : 286}" width="64" height="4" rx="2" fill="#ffffff" opacity="0.55"/>
</svg>`;
}

// ── 各项目插画(右侧区域,约 x 720-1140) ──
const arts = {
  // 爬山趣:层叠山峦 + 太阳 + 虚线山径
  pashanqu: `
    <circle cx="1010" cy="120" r="42" fill="#fbd38d" opacity="0.9"/>
    <path d="M700 330 L820 170 L940 330 Z" fill="#ffffff" opacity="0.14"/>
    <path d="M860 330 L1000 130 L1140 330 Z" fill="#ffffff" opacity="0.22"/>
    <path d="M760 330 L880 210 L1000 330 Z" fill="#1b4332" opacity="0.55"/>
    <path d="M960 248 L986 220 L1002 236 L1030 196" stroke="#ffe9b8" stroke-width="3" stroke-dasharray="7 7" fill="none" stroke-linecap="round"/>`,
  // Git Autosync:分支合并图
  autosync: `
    <g stroke="#ffffff" stroke-width="3.5" fill="none" opacity="0.85">
      <path d="M760 210 C 860 210, 860 130, 960 130"/>
      <path d="M760 210 C 860 210, 860 290, 960 290"/>
      <path d="M960 130 C 1040 130, 1040 210, 1120 210"/>
      <path d="M960 290 C 1040 290, 1040 210, 1120 210"/>
    </g>
    <g fill="#ffffff">
      <circle cx="760" cy="210" r="10"/><circle cx="860" cy="170" r="7" opacity="0.5"/>
      <circle cx="960" cy="130" r="10"/><circle cx="960" cy="290" r="10"/>
      <circle cx="1060" cy="210" r="7" opacity="0.5"/><circle cx="1120" cy="210" r="12"/>
    </g>`,
  // LearnPostTrain:上升的训练曲线
  learnposttrain: `
    <g stroke="#ffffff" stroke-width="1.5" opacity="0.18">
      <line x1="750" y1="110" x2="750" y2="320"/><line x1="750" y1="320" x2="1140" y2="320"/>
      <line x1="750" y1="215" x2="1140" y2="215" stroke-dasharray="4 6"/>
      <line x1="945" y1="110" x2="945" y2="320" stroke-dasharray="4 6"/>
    </g>
    <path d="M750 300 C 810 295, 840 268, 890 250 C 950 228, 990 200, 1050 180 C 1085 168, 1105 160, 1130 150"
      stroke="#c3f0ff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <g fill="#c3f0ff">
      <circle cx="890" cy="250" r="5"/><circle cx="1010" cy="192" r="5"/><circle cx="1130" cy="150" r="7"/>
    </g>
    <text x="1092" y="132" font-family="${FONT}" font-size="19" fill="#c3f0ff" opacity="0.95">reward ↑</text>`,
  // GLM Quota Monitor:额度环 + 用量柱状
  glm: `
    <circle cx="880" cy="212" r="78" fill="none" stroke="#ffffff" stroke-width="14" opacity="0.18"/>
    <path d="M880 134 a78 78 0 1 1 -54.4 133.6" fill="none" stroke="#bfe0ff" stroke-width="14" stroke-linecap="round"/>
    <text x="880" y="222" font-family="${FONT}" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">62%</text>
    <g fill="#bfe0ff" opacity="0.9">
      <rect x="1010" y="240" width="22" height="60" rx="4"/>
      <rect x="1048" y="205" width="22" height="95" rx="4"/>
      <rect x="1086" y="170" width="22" height="130" rx="4"/>
      <rect x="1124" y="128" width="22" height="172" rx="4" opacity="0.6"/>
    </g>`,
  // Agent:数据文件夹整理(乱→有序)
  agent: `
    <g fill="#ffffff" opacity="0.85">
      <path d="M740 150 h44 l10 -13 h44 v52 h-98 Z"/>
      <path d="M750 220 h44 l10 -13 h44 v52 h-98 Z"/>
    </g>
    <text x="790" y="192" font-family="sans-serif" font-size="15" fill="#a5f3fc" text-anchor="middle">DICOM?</text>
    <text x="800" y="262" font-family="sans-serif" font-size="15" fill="#a5f3fc" text-anchor="middle">CT_001</text>
    <path d="M870 205 H925" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M925 205 L911 197 V213 Z" fill="#ffffff"/>
    <g transform="translate(945,140)">
      <circle cx="45" cy="40" r="12" fill="#ffffff"/>
      <path d="M62 58 a34 34 0 1 0 -34 34" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
    </g>
    <g font-family="sans-serif" font-size="20" font-weight="700">
      <text x="1010" y="180" fill="#a7f3d0">✓</text>
      <text x="1010" y="230" fill="#fde68a">!</text>
      <text x="1060" y="205" font-size="16" fill="#ffffff" opacity="0.8">→ 建模特征</text>
    </g>`,
  // Causal:因果 DAG(混杂结构,Y 为结局心脏)
  causal: `
    <g stroke="#ffffff" stroke-width="3" fill="none" opacity="0.85">
      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#ffffff"/>
      </marker>
      <path d="M810 300 L810 246" marker-end="url(#arr)"/>
      <path d="M1060 300 L1060 246" marker-end="url(#arr)"/>
      <path d="M833 320 C 900 320, 950 265, 1030 262" marker-end="url(#arr)" stroke-dasharray="6 6"/>
      <path d="M833 285 C 900 250, 960 215, 1028 215" marker-end="url(#arr)"/>
    </g>
    <g font-family="'Segoe UI', sans-serif" font-size="26" font-weight="600" fill="#ffffff" text-anchor="middle">
      <circle cx="800" cy="335" r="30" fill="#ffffff" opacity="0.22"/><text x="800" y="344">A</text>
      <circle cx="1070" cy="335" r="30" fill="#ffffff" opacity="0.22"/><text x="1070" y="344">B</text>
      <g transform="translate(935,205)">
        <circle r="34" fill="#ffffff" opacity="0.92"/>
        <path d="M0 14 C -19 -2, -15 -16, 0 -8 C 15 -16, 19 -2, 0 14 Z" fill="#ef4444"/>
      </g>
      <circle cx="935" cy="330" r="26" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5"/><text x="935" y="339" opacity="0.7">U</text>
    </g>`,
};

const covers = [
  { slug: 'pashanqu', art: arts.pashanqu, bgFrom: '#2f855a', bgTo: '#1b4332',
    titleEn: 'i爬山', titleZh: 'PaShanQu · 徒步登山打卡', subtitle: '零依赖纯前端 · 爬楼化作虚拟登山' },
  { slug: 'awesome-git-autosync', art: arts.autosync, bgFrom: '#ea580c', bgTo: '#9a3412',
    titleEn: 'Awesome-Git-Autosync', titleZh: 'Git 仓库自动同步', subtitle: 'system script + txt is all you need' },
  { slug: 'learnposttrain', art: arts.learnposttrain, bgFrom: '#4361ee', bgTo: '#7209b7',
    titleEn: 'LearnPostTrain', titleZh: 'GRPO + LoRA 后训练实验', subtitle: '单卡消费级 GPU · 可复现可诊断' },
  { slug: 'glm-quota-monitor', art: arts.glm, bgFrom: '#3b82f6', bgTo: '#1e40af',
    titleEn: 'GLM Quota Monitor', titleZh: 'GLM 额度监控', subtitle: '跨平台桌面工具 · 用量统计 · 智能预警' },
  { slug: 'automedatagent', art: arts.agent, bgFrom: '#0891b2', bgTo: '#155e75',
    titleEn: 'AutoMedatAGENT', titleZh: '医学数据静默智能体', subtitle: '静默值守 · 2.16TB 医院影像流水线' },
  { slug: 'causalresearch', art: arts.causal, bgFrom: '#64748b', bgTo: '#334155',
    titleEn: 'CausalResearch', titleZh: '治疗方案因果推荐', subtitle: '多模态融合 · 反事实推断 · DragonNet/TransTEE' },
];

const OUT = path.resolve(process.cwd(), 'public/images');
for (const c of covers) {
  const svg = frame(c);
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(path.join(OUT, `${c.slug}.webp`));
  console.log(`[gen] public/images/${c.slug}.webp`);
}
console.log(`完成,生成 ${covers.length} 张封面。`);
