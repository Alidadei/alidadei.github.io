import React, { useState, useEffect, useRef } from 'react';
import { Solar } from 'lunar-javascript';

interface SunArcProps {
  lang: 'zh' | 'en';
}

// 五行颜色映射
const wuxingColor: Record<string, string> = {
  // 木
  '甲': '#3d8b5a', '乙': '#3d8b5a', '寅': '#3d8b5a', '卯': '#3d8b5a',
  // 火
  '丙': '#c0392b', '丁': '#c0392b', '巳': '#c0392b', '午': '#c0392b',
  // 土
  '戊': '#9a7b4a', '己': '#9a7b4a', '辰': '#9a7b4a', '戌': '#9a7b4a', '丑': '#9a7b4a', '未': '#9a7b4a',
  // 金
  '庚': '#b8860b', '辛': '#b8860b', '申': '#b8860b', '酉': '#b8860b',
  // 水
  '壬': '#2874a6', '癸': '#2874a6', '亥': '#2874a6', '子': '#2874a6',
};

function LunarDate({ lang }: { lang: 'zh' | 'en' }) {
  const [now, setNow] = useState(() => new Date());
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const mounted = useRef(false);

  // 每分钟检查日期是否变化，跨日自动更新干支
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(prev => {
        const next = new Date();
        return prev.getDate() !== next.getDate() ? next : prev;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const lunar = Solar.fromDate(now).getLunar();
  const yearGZ = lunar.getYearInGanZhi();
  const monthGZ = lunar.getMonthInGanZhi();
  const dayGZ = lunar.getDayInGanZhi();

  // 三列数据：干支 + 标签
  const pillars = [
    { stem: yearGZ[0], branch: yearGZ[1], label: '年' },
    { stem: monthGZ[0], branch: monthGZ[1], label: '月' },
    { stem: dayGZ[0], branch: dayGZ[1], label: '日' },
  ];

  // 逐字打字机效果
  const fullChars = pillars.flatMap(p => [p.stem, p.branch, p.label]);
  const fullText = fullChars.join('');

  useEffect(() => {
    // 跳过 SSR，只在客户端水合后执行
    if (!mounted.current) {
      mounted.current = true;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(timer);
        setTimeout(() => setDone(true), 600);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [fullText]);

  // 将 displayed 映射回三列，每列 3 个字符
  const colChars = [
    displayed.slice(0, 3),
    displayed.slice(3, 6),
    displayed.slice(6, 9),
  ];

  return (
    <div className="py-3 select-none" style={{ minHeight: '28px' }}>
      <div className="flex items-start gap-0.5 sm:gap-3" style={{ color: 'var(--color-text-muted)' }}>
        {pillars.map((p, idx) => {
          const text = colChars[idx];
          const isTyping = !done && text.length > 0 && text.length < 3;
          return (
            <div key={p.label} className="text-center">
              <div className="text-sm tracking-widest flex flex-col items-center leading-relaxed">
                {text.split('').map((char, ci) => (
                  <span key={ci} style={{ color: wuxingColor[char] || 'inherit', fontWeight: wuxingColor[char] ? 600 : 400 }}>
                    {char}
                  </span>
                ))}
                {isTyping && (
                  <span style={{ animation: 'blink 0.8s step-end infinite', color: 'var(--color-accent)', fontWeight: 300 }}>
                    |
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 精简后只剩左上角的「干支 + 问候」。
// 原 2D 天空/太阳/星星/月亮/流星层已移除——首页天空改由 3D 场景(background.ts)渲染，随时间变化。
export default function SunArc({ lang }: SunArcProps) {
  const [time, setTime] = useState({ hour: 12, min: 0 });

  useEffect(() => {
    const now = new Date();
    setTime({ hour: now.getHours(), min: now.getMinutes() });
    const timer = setInterval(() => {
      const n = new Date();
      setTime({ hour: n.getHours(), min: n.getMinutes() });
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const h = time.hour + time.min / 60;
  const greeting = lang === 'zh'
    ? (h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好')
    : (h < 6 ? 'Good Night' : h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening');

  return (
    <>
      {/* 左上角：干支 + 问候 */}
      <div className="fixed top-[66px] sm:top-20 left-1 sm:left-4 pointer-events-none" style={{ zIndex: 10 }}>
        <LunarDate lang={lang} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
          {greeting}
        </p>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </>
  );
}
