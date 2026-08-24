// 为 portfolio 项目生成封面 → public/images/<slug>.webp
// 两类风格:
//   研究型 = 白底论文风架构图(模块框 + 箭头 + Fig.1 题注),像论文里的 Figure 1
//   实践型 = 彩色渐变插画(保留项目主色识别度)
// 画布 1200×600(2:1),与项目卡片 aspect-[2/1] 一致,object-cover 零裁切。
// sharp 直接渲染 SVG(中文走系统字体)。用法: node scripts/gen-portfolio-covers.mjs
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const W = 1200, H = 600;
const SANS = `'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif`;
const SERIF = `Georgia,'Times New Roman','Noto Serif SC',serif`;
const MONO = `Consolas,'Courier New',monospace`;
const INK = '#1c1917', MUTE = '#78716c', LINE = '#d6d3d1', PAPER = '#fbfbf9';

/* ───────────────────────── 论文风通用件 ───────────────────────── */

// SVG 头(含纸底 + 网格 + 箭头 marker)
function paperDefs(accent) {
  const id = 'arr' + accent.replace('#', '');
  return `
  <defs>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#e9e7e2" stroke-width="1"/>
    </pattern>
    <marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${accent}"/>
    </marker>
    <marker id="${id}g" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#a8a29e"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.55"/>`;
}

// 顶部名牌:项目名(衬线)+ 中文副题 + 右上状态章
function nameplate({ name, zh, status, accent }) {
  return `
  <rect x="60" y="52" width="8" height="52" rx="3" fill="${accent}"/>
  <text x="84" y="88" font-family="${SERIF}" font-size="42" font-weight="700" fill="${INK}">${name}</text>
  <text x="84" y="122" font-family="${SANS}" font-size="25" fill="${MUTE}">${zh}</text>
  <g>
    <rect x="${W - 60 - status.length * 15 - 44}" y="62" width="${status.length * 15 + 44}" height="42" rx="21" fill="#ffffff" stroke="${LINE}" stroke-width="1.5"/>
    <circle cx="${W - 60 - status.length * 15 - 20}" cy="83" r="6" fill="${accent}"/>
    <text x="${W - 60 - 22}" y="90" text-anchor="end" font-family="${MONO}" font-size="21" letter-spacing="1" fill="${MUTE}">${status}</text>
  </g>`;
}

// 底部 Fig. 题注
function figCaption(text, accent) {
  return `
  <line x1="60" y1="524" x2="${W - 60}" y2="524" stroke="#e7e5e0" stroke-width="1.5"/>
  <text x="60" y="562" font-family="${SERIF}" font-size="27" fill="${MUTE}"><tspan font-weight="700" fill="${accent}">Fig. 1</tspan>&#160;&#160;${text}</text>`;
}

// 模块框:num=左上角序号(标题下移);dark=accent 实底白字;lines=[主标题, 副标题]
function mbox({ x, y, w, h, lines, num, accent, dark = false, monoSub = false, rx = 10 }) {
  const cx = x + w / 2;
  const fill = dark ? accent : '#ffffff';
  const stroke = dark ? accent : LINE;
  const tFill = dark ? '#ffffff' : INK;
  const sFill = dark ? 'rgba(255,255,255,.78)' : MUTE;
  const [t, s] = lines;
  // 主标题字号随长度自适应,避免溢出窄框
  const fs = t.length > 10 ? 19 : t.length > 9 ? 21 : 25;
  let txt = '';
  if (num) {
    // 序号框:序号贴左上角,标题整体下移
    txt = `<text x="${x + 14}" y="${y + 30}" font-family="${MONO}" font-size="20" font-weight="700" fill="${accent}" opacity="0.85">${String(num).padStart(2, '0')}</text>
    <text x="${cx}" y="${y + 58}" text-anchor="middle" font-family="${SANS}" font-size="${fs}" font-weight="600" fill="${tFill}">${t}</text>
    <text x="${cx}" y="${y + 84}" text-anchor="middle" font-family="${SANS}" font-size="19" fill="${sFill}">${s}</text>`;
  } else if (s) {
    txt = `<text x="${cx}" y="${y + h / 2 - 7}" text-anchor="middle" font-family="${SANS}" font-size="${fs}" font-weight="600" fill="${tFill}">${t}</text>
    <text x="${cx}" y="${y + h / 2 + 25}" text-anchor="middle" font-family="${monoSub ? MONO : SANS}" font-size="${monoSub ? 18 : 20}" fill="${sFill}">${s}</text>`;
  } else {
    txt = `<text x="${cx}" y="${y + h / 2 + 9}" text-anchor="middle" font-family="${SANS}" font-size="${fs}" font-weight="600" fill="${tFill}">${t}</text>`;
  }
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>${txt}</g>`;
}

// 水平箭头(gray=工序间弱箭头)
function harrow(x1, x2, y, accent, gray = false) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${gray ? '#a8a29e' : accent}" stroke-width="2.6" marker-end="url(#arr${accent.replace('#', '')}${gray ? 'g' : ''})"/>`;
}
// 任意路径箭头
function parrow(d, accent, extra = '') {
  return `<path d="${d}" fill="none" stroke="${accent}" stroke-width="2.6" marker-end="url(#arr${accent.replace('#', '')})" ${extra}/>`;
}

function paperCover({ slug, name, zh, status, accent, caption, diagram }) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${paperDefs(accent)}
  ${nameplate({ name, zh, status, accent })}
  ${diagram}
  ${figCaption(caption, accent)}
</svg>`;
}

/* ───────────────────── 研究型架构图(4 张) ───────────────────── */

// AutoMedatAGENT:上层智能体编排 + 下层六道工序流水线
const diagAgent = (A) => `
  <rect x="60" y="146" width="1080" height="122" rx="14" fill="#f0fdfa" stroke="${A}" stroke-width="1.8" stroke-dasharray="7 6"/>
  <text x="84" y="176" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="2.5" fill="${A}">AGENT ORCHESTRATION · 智能体编排层</text>
  ${mbox({ x: 84, y: 190, w: 243, h: 60, lines: ['Orchestrator', '编排调度'], accent: A })}
  ${mbox({ x: 347, y: 190, w: 243, h: 60, lines: ['Policy 守则', 'workflow_policy.json'], accent: A, monoSub: true })}
  ${mbox({ x: 610, y: 190, w: 243, h: 60, lines: ['LLM Router', 'DeepSeek · GLM'], accent: A, monoSub: true })}
  ${mbox({ x: 873, y: 190, w: 243, h: 60, lines: ['Human Review', '人工复核点'], accent: A })}
  ${parrow(`M600 268 V296`, A)}
  <text x="616" y="288" font-family="${SANS}" font-size="20" fill="${MUTE}">监督执行</text>
  ${mbox({ x: 60, y: 300, w: 128, h: 100, lines: ['Manifest', '扫描建册'], num: 1, accent: A })}
  ${harrow(191, 208, 350, A, true)}
  ${mbox({ x: 212, y: 300, w: 128, h: 100, lines: ['Identity', '身份核对'], num: 2, accent: A })}
  ${harrow(343, 360, 350, A, true)}
  ${mbox({ x: 364, y: 300, w: 128, h: 100, lines: ['DICOM→NIfTI', '转格式'], num: 3, accent: A })}
  ${harrow(495, 512, 350, A, true)}
  ${mbox({ x: 516, y: 300, w: 128, h: 100, lines: ['Preprocess', '标准化'], num: 4, accent: A })}
  ${harrow(647, 664, 350, A, true)}
  ${mbox({ x: 668, y: 300, w: 128, h: 100, lines: ['QC', '质检缩略图'], num: 5, accent: A })}
  ${harrow(799, 816, 350, A, true)}
  ${mbox({ x: 820, y: 300, w: 128, h: 100, lines: ['Radiomics', '2560-d 特征'], num: 6, accent: A })}
  ${harrow(951, 978, 350, A)}
  <rect x="982" y="300" width="158" height="100" rx="10" fill="#ecfdf5" stroke="#10b981" stroke-width="1.8"/>
  <text x="1061" y="343" text-anchor="middle" font-family="${SANS}" font-size="20" font-weight="700" fill="#047857">Research-ready</text>
  <text x="1061" y="373" text-anchor="middle" font-family="${SANS}" font-size="19" fill="#059669">科研就绪数据集</text>
  <text x="600" y="452" text-anchor="middle" font-family="${SANS}" font-size="22" fill="${MUTE}">增量处理 · 只扫新数据 · 断点续传 · 每步可审计可回退</text>`;

// CausalResearch:三模态编码 → 门控融合 → Multi-DragonNet → 三反事实头
const diagCausal = (A) => {
  const sub = (n) => `<tspan font-size="16" dy="6">${n}</tspan><tspan dy="-6">)</tspan>`;
  return `
  ${mbox({ x: 60, y: 152, w: 170, h: 76, lines: ['Imaging ×3', '头·胸·腿影像'] })}
  ${harrow(230, 252, 190, A, true)}
  ${mbox({ x: 256, y: 152, w: 150, h: 76, lines: ['ResNet', '影像编码'] })}
  ${mbox({ x: 60, y: 262, w: 170, h: 76, lines: ['Lab Tables', '化验·临床表格'] })}
  ${harrow(230, 252, 300, A, true)}
  ${mbox({ x: 256, y: 262, w: 150, h: 76, lines: ['TabPFN', '表格编码'] })}
  ${mbox({ x: 60, y: 372, w: 170, h: 76, lines: ['Reports', 'PDF 报告文本'] })}
  ${harrow(230, 252, 410, A, true)}
  ${mbox({ x: 256, y: 372, w: 150, h: 76, lines: ['BERT', '文本编码'] })}
  ${parrow('M406 190 C 442 190, 452 244, 476 264', A)}
  ${harrow(406, 444, 300, A)}
  ${parrow('M406 410 C 442 410, 452 356, 476 336', A)}
  <rect x="480" y="212" width="140" height="176" rx="12" fill="${A}"/>
  <text x="550" y="280" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="700" fill="#ffffff">Gate</text>
  <text x="550" y="310" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="700" fill="#ffffff">Fusion</text>
  <text x="550" y="342" text-anchor="middle" font-family="${SANS}" font-size="18" fill="rgba(255,255,255,.8)">门控融合</text>
  ${harrow(620, 654, 300, A)}
  <rect x="658" y="266" width="120" height="68" rx="10" fill="#eef2ff" stroke="#a5b4fc" stroke-width="1.8"/>
  <text x="718" y="294" text-anchor="middle" font-family="${MONO}" font-size="23" font-weight="700" fill="${A}">z</text>
  <text x="718" y="322" text-anchor="middle" font-family="${SANS}" font-size="18" fill="${MUTE}">患者表征</text>
  ${harrow(778, 804, 300, A)}
  <rect x="808" y="240" width="160" height="120" rx="12" fill="#ffffff" stroke="${A}" stroke-width="2.2"/>
  <text x="888" y="288" text-anchor="middle" font-family="${SANS}" font-size="22" font-weight="700" fill="${A}">Multi-</text>
  <text x="888" y="316" text-anchor="middle" font-family="${SANS}" font-size="22" font-weight="700" fill="${A}">DragonNet</text>
  <text x="888" y="344" text-anchor="middle" font-family="${SANS}" font-size="18" fill="${MUTE}">治疗塔 · 3 种方案</text>
  ${parrow('M968 272 C 1000 258, 1010 224, 1034 202', A)}
  ${harrow(968, 1032, 300, A)}
  ${parrow('M968 328 C 1000 342, 1010 376, 1034 398', A)}
  <rect x="1038" y="164" width="102" height="52" rx="10" fill="#eef2ff" stroke="#a5b4fc" stroke-width="1.6"/>
  <text x="1089" y="197" text-anchor="middle" font-family="${MONO}" font-size="21" font-weight="700" fill="${A}">Ŷ(${sub(1)}</text>
  <rect x="1038" y="274" width="102" height="52" rx="10" fill="#eef2ff" stroke="#a5b4fc" stroke-width="1.6"/>
  <text x="1089" y="307" text-anchor="middle" font-family="${MONO}" font-size="21" font-weight="700" fill="${A}">Ŷ(${sub(2)}</text>
  <rect x="1038" y="384" width="102" height="52" rx="10" fill="#eef2ff" stroke="#a5b4fc" stroke-width="1.6"/>
  <text x="1089" y="417" text-anchor="middle" font-family="${MONO}" font-size="21" font-weight="700" fill="${A}">Ŷ(${sub(3)}</text>
  <text x="600" y="488" text-anchor="middle" font-family="${SANS}" font-size="22" fill="${MUTE}">反事实结局比较 · ranking loss → 推荐最优治疗方案</text>`;
};

// LearnPostTrain:GRPO 训练环(单卡 GPU 外框 + 回环更新箭头)
const diagGRPO = (A) => `
  <rect x="40" y="150" width="1120" height="286" rx="16" fill="#faf5ff" stroke="#c4b5fd" stroke-width="1.8" stroke-dasharray="8 6"/>
  <text x="66" y="182" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="2.5" fill="${A}">1 × CONSUMER GPU · 单卡消费级显卡</text>
  ${mbox({ x: 76, y: 214, w: 186, h: 96, lines: ['Policy', 'Qwen-3B + LoRA'], accent: A, monoSub: true })}
  ${harrow(262, 288, 262, A)}
  ${mbox({ x: 292, y: 214, w: 186, h: 96, lines: ['Rollouts ×G', 'Countdown 采样'], accent: A })}
  ${harrow(478, 504, 262, A)}
  ${mbox({ x: 508, y: 214, w: 186, h: 96, lines: ['Rule Reward', '规则判定奖励'], accent: A })}
  ${harrow(694, 720, 262, A)}
  ${mbox({ x: 724, y: 214, w: 200, h: 96, lines: ['Advantage', '(r−μ)/σ 组内归一'], accent: A, monoSub: true })}
  ${harrow(924, 950, 262, A)}
  ${mbox({ x: 954, y: 214, w: 186, h: 96, lines: ['PG Update', '策略梯度更新'], accent: A, dark: true })}
  ${parrow('M1047 310 V356 H169 V318', A)}
  <text x="608" y="384" text-anchor="middle" font-family="${MONO}" font-size="21" fill="${MUTE}">θ ← θ + α∇J(θ) · 更新策略参数</text>
  <text x="600" y="486" text-anchor="middle" font-family="${SANS}" font-size="22" fill="${MUTE}">无价值网络 · 组内相对基线 · 低显存可复现实验配置</text>`;

// SearchRL 复现:智能体-环境交互环 + 奖励优化
const diagSearchRL = (A) => `
  ${mbox({ x: 120, y: 230, w: 250, h: 130, lines: ['Reasoning Agent', '推理智能体 (LLM)'], accent: A })}
  ${mbox({ x: 830, y: 230, w: 250, h: 130, lines: ['Search Env', '检索环境 (Tools)'], accent: A })}
  ${parrow('M330 244 C 500 170, 700 170, 868 234', A)}
  <text x="600" y="158" text-anchor="middle" font-family="${MONO}" font-size="21" fill="${MUTE}">query a&#8348; · 检索请求</text>
  ${parrow('M872 356 C 720 424, 480 424, 336 364', A)}
  <text x="600" y="466" text-anchor="middle" font-family="${MONO}" font-size="21" fill="${MUTE}">documents o&#8348; · 检索观测</text>
  <rect x="490" y="381" width="220" height="54" rx="27" fill="#fff1f2" stroke="${A}" stroke-width="1.8"/>
  <text x="600" y="415" text-anchor="middle" font-family="${SANS}" font-size="20" font-weight="600" fill="${A}">reward r&#8348; · 奖励优化</text>
  <text x="600" y="500" text-anchor="middle" font-family="${SANS}" font-size="22" fill="${MUTE}">复现基线 → 改进奖励设计 · 实验整理中</text>`;

/* ───────────────────── 实践型彩色插画(3 张) ───────────────────── */

function personalCover({ slug, bgFrom, bgTo, titleEn, titleZh, subtitle, art }) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bgFrom}"/><stop offset="1" stop-color="${bgTo}"/>
    </linearGradient>
    <marker id="arrw" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#ffffff"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 70}" cy="60" r="150" fill="#ffffff" opacity="0.05"/>
  <circle cx="90" cy="${H - 40}" r="120" fill="#ffffff" opacity="0.05"/>
  <circle cx="900" cy="300" r="235" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.14"/>
  ${art}
  <text x="80" y="212" font-family="${SANS}" font-size="56" font-weight="700" fill="#ffffff">${titleEn}</text>
  <text x="80" y="274" font-family="${SANS}" font-size="30" fill="#ffffff" opacity="0.95">${titleZh}</text>
  <text x="80" y="328" font-family="${SANS}" font-size="22" fill="#ffffff" opacity="0.75">${subtitle}</text>
  <rect x="80" y="356" width="72" height="5" rx="2.5" fill="#ffffff" opacity="0.6"/>
</svg>`;
}

const artPashanqu = `
  <circle cx="1010" cy="140" r="60" fill="#fcd34d" opacity="0.18"/>
  <circle cx="1010" cy="140" r="42" fill="#fcd34d" opacity="0.95"/>
  <path d="M620 480 L830 218 L1040 480 Z" fill="#ffffff" opacity="0.12"/>
  <path d="M780 480 L975 245 L1170 480 Z" fill="#ffffff" opacity="0.2"/>
  <path d="M690 480 L880 292 L1070 480 Z" fill="#14532d" opacity="0.62"/>
  <path d="M828 452 L862 408 L850 384 L888 342 L878 318 L918 278" stroke="#fde68a" stroke-width="4" stroke-dasharray="11 9" fill="none" stroke-linecap="round"/>
  <line x1="975" y1="245" x2="975" y2="206" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M975 206 L1009 216 L975 227 Z" fill="#f87171"/>
  <g stroke="#ffffff" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round">
    <path d="M636 480 h34 v-24 h34 v-24 h34 v-24 h34"/>
  </g>
  <text x="806" y="530" text-anchor="middle" font-family="${SANS}" font-size="20" fill="#ffffff" opacity="0.55">海拔进度 · 登顶证书</text>`;

const artAutosync = `
  <g stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round">
    <rect x="640" y="252" width="130" height="86" rx="10"/>
    <line x1="622" y1="352" x2="788" y2="352"/>
    <rect x="1010" y="252" width="130" height="86" rx="10"/>
    <line x1="992" y1="352" x2="1158" y2="352"/>
  </g>
  <g stroke="#ffffff" stroke-width="3.5" fill="none" stroke-linecap="round">
    <path d="M693 302 a13 13 0 1 1 4 10"/>
    <path d="M697 290 l0 8 -8 1"/>
    <path d="M717 288 a13 13 0 1 0 -4 -10"/>
    <path d="M713 314 l0 -8 8 -1"/>
    <path d="M1063 302 a13 13 0 1 1 4 10"/>
    <path d="M1067 290 l0 8 -8 1"/>
    <path d="M1087 288 a13 13 0 1 0 -4 -10"/>
    <path d="M1083 314 l0 -8 8 -1"/>
  </g>
  <g stroke="#ffffff" stroke-width="4" fill="none">
    <ellipse cx="890" cy="278" rx="44" ry="14"/>
    <path d="M846 278 V330 a44 14 0 0 0 88 0 V278"/>
  </g>
  <g stroke="#ffffff" stroke-width="3.5" fill="none" stroke-linecap="round">
    <path d="M782 270 H830" marker-end="url(#arrw)"/>
    <path d="M950 270 H998" marker-end="url(#arrw)"/>
    <path d="M998 322 H950" marker-end="url(#arrw)"/>
    <path d="M830 322 H782" marker-end="url(#arrw)"/>
  </g>
  <g stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round">
    <circle cx="890" cy="152" r="24"/>
    <path d="M890 152 V136 M890 152 L902 158"/>
    <path d="M932 152 a42 42 0 1 1 -14 -30" opacity="0.6"/>
    <path d="M924 112 l4 12 -12 3" opacity="0.6"/>
  </g>
  <text x="890" y="416" text-anchor="middle" font-family="${SANS}" font-size="20" fill="#ffffff" opacity="0.55">commit → push → fetch · 定时自动往返</text>`;

const artGlm = `
  <g transform="translate(790,296)">
    <circle r="92" fill="none" stroke="#ffffff" stroke-width="17" opacity="0.18"/>
    <path d="M0 -92 a92 92 0 1 1 -64.3 157.6" fill="none" stroke="#dbeafe" stroke-width="17" stroke-linecap="round"/>
    <text y="6" text-anchor="middle" font-family="${SANS}" font-size="44" font-weight="700" fill="#ffffff">62%</text>
    <text y="42" text-anchor="middle" font-family="${SANS}" font-size="19" fill="#ffffff" opacity="0.7">套餐额度已用</text>
  </g>
  <g fill="#dbeafe">
    <rect x="962" y="330" width="27" height="72" rx="6" opacity="0.85"/>
    <rect x="1004" y="292" width="27" height="110" rx="6" opacity="0.9"/>
    <rect x="1046" y="252" width="27" height="150" rx="6" opacity="0.95"/>
    <rect x="1088" y="206" width="27" height="196" rx="6" opacity="0.6"/>
  </g>
  <line x1="946" y1="404" x2="1130" y2="404" stroke="#ffffff" stroke-width="3" opacity="0.35"/>
  <g transform="translate(1102,138)">
    <path d="M0 -26 c-15 0 -21 11 -21 24 v13 l-9 13 h60 l-9 -13 v-13 c0 -13 -6 -24 -21 -24 z" fill="#ffffff" opacity="0.92"/>
    <circle cy="28" r="5" fill="#ffffff" opacity="0.92"/>
    <circle cx="18" cy="-22" r="9" fill="#fde68a"/>
  </g>
  <g transform="translate(866,120)">
    <rect width="150" height="42" rx="21" fill="#ffffff" opacity="0.12"/>
    <rect x="1.5" y="1.5" width="147" height="39" rx="19.5" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.5"/>
    <text x="75" y="28" text-anchor="middle" font-family="${MONO}" font-size="20" fill="#ffffff">↻ 08:00:00</text>
  </g>
  <text x="890" y="470" text-anchor="middle" font-family="${SANS}" font-size="20" fill="#ffffff" opacity="0.55">额度 · 倒计时 · 趋势 · 预警</text>`;

/* ───────────────────────────── 生成 ───────────────────────────── */

const covers = [
  // ── 研究型:白底论文风架构图 ──
  {
    slug: 'automedatagent', accent: '#0f766e',
    name: 'AutoMedatAGENT', zh: '医学数据静默智能体 · 2.16TB 医院影像流水线', status: 'EXPERIMENT · 2026',
    caption: '编排层(策略守则 · LLM 路由 · 人工复核)监督六道工序,产出科研就绪数据。',
    diagram: diagAgent('#0f766e'),
  },
  {
    slug: 'causalresearch', accent: '#4338ca',
    name: 'CausalResearch', zh: '治疗方案因果推荐 · 多模态融合 + 反事实推断', status: 'WIP · 2026',
    caption: '三模态编码 + 门控融合得到患者表征,Multi-DragonNet 输出各治疗的反事实结局。',
    diagram: diagCausal('#4338ca'),
  },
  {
    slug: 'learnposttrain', accent: '#7c3aed',
    name: 'LearnPostTrain', zh: 'GRPO + LoRA 后训练实验 · 单卡可复现配方', status: 'OPEN SOURCE · 2026',
    caption: 'GRPO 训练环:组内相对优势替代价值网络,3B 模型在单张消费级显卡上完成强化学习。',
    diagram: diagGRPO('#7c3aed'),
  },
  {
    slug: 'portfolio-2', accent: '#be123c',
    name: 'SearchRL', zh: '检索增强 RL 复现与奖励优化 · 实验整理中', status: 'WIP · 2026',
    caption: '智能体-环境交互框架:检索请求 / 观测往返,奖励信号驱动策略更新。',
    diagram: diagSearchRL('#be123c'),
  },
  // ── 实践型:彩色插画风 ──
  {
    slug: 'pashanqu', personal: true, bgFrom: '#2f855a', bgTo: '#1b4332',
    titleEn: 'i爬山', titleZh: 'PaShanQu · 徒步登山打卡', subtitle: '零依赖纯前端 · 把每天的爬楼化作虚拟登山',
    art: artPashanqu,
  },
  {
    slug: 'awesome-git-autosync', personal: true, bgFrom: '#ea580c', bgTo: '#9a3412',
    titleEn: 'Awesome-Git-Autosync', titleZh: 'Git 仓库自动同步', subtitle: 'system script + txt is all you need · 约 4KB 零依赖',
    art: artAutosync,
  },
  {
    slug: 'glm-quota-monitor', personal: true, bgFrom: '#3b82f6', bgTo: '#1e40af',
    titleEn: 'GLM Quota Monitor', titleZh: 'GLM 额度监控', subtitle: '跨平台桌面工具 · 用量统计 · 智能预警',
    art: artGlm,
  },
];

const OUT = path.resolve(process.cwd(), 'public/images');
const ASSETS = path.resolve(process.cwd(), 'public/portfolio/assets');
for (const c of covers) {
  const svg = c.personal ? personalCover(c) : paperCover(c);
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(path.join(OUT, `${c.slug}.webp`));
  console.log(`[gen] public/images/${c.slug}.webp`);
  // 研究型另导出纯架构图 SVG(裁掉名牌与题注区),供详情页内嵌为 Figure 1
  if (!c.personal) {
    const arch = `<svg width="${W}" height="400" viewBox="0 130 1200 400" xmlns="http://www.w3.org/2000/svg">
  ${paperDefs(c.accent)}
  ${c.diagram}
</svg>`;
    fs.writeFileSync(path.join(ASSETS, `${c.slug}-arch.svg`), arch);
    console.log(`[gen] public/portfolio/assets/${c.slug}-arch.svg`);
  }
}
console.log(`完成,生成 ${covers.length} 张封面。`);
