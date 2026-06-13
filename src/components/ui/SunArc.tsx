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

  const sunRise = 5.5;
  const sunSet = 18.5;
  const progress = Math.max(0, Math.min(1, (h - sunRise) / (sunSet - sunRise)));
  const isDay = h >= sunRise && h <= sunSet;
  const isNight = h >= 20 || h < 4.5;
  const isDusk = h >= sunSet && h < 20;
  const isDawn = h >= 4.5 && h < sunRise;

  const arcHeight = Math.sin(progress * Math.PI);
  const sunX = 8 + progress * 84;
  const altitude = isDay ? arcHeight : 0;

  // Continuous brightness factor: 0=midnight, 1=noon peak
  const brightness = (() => {
    if (isDay) return 0.25 + 0.75 * arcHeight; // 0.25→1.0
    if (isDusk) {
      const f = (h - sunSet) / (20 - sunSet);
      return 0.25 * (1 - f);
    }
    if (isDawn) {
      const f = (h - 4.5) / (sunRise - 4.5);
      return 0.25 * f;
    }
    return 0;
  })();

  // Sky gradient — scales with brightness
  const skyGradient = (() => {
    if (isDay) {
      // High sun: bright blue; mid: warm blue; low: orange
      if (altitude > 0.6) {
        const a = 0.3 + 0.5 * altitude;
        return `linear-gradient(180deg, rgba(100,170,230,${a}) 0%, rgba(160,200,240,${a*0.6}) 40%, rgba(220,230,245,${a*0.25}) 70%, rgba(250,246,240,0) 100%)`;
      }
      if (altitude > 0.2) {
        const a = 0.25 + 0.4 * altitude;
        return `linear-gradient(180deg, rgba(220,155,80,${a}) 0%, rgba(210,175,130,${a*0.6}) 40%, rgba(240,220,195,${a*0.25}) 70%, rgba(250,246,240,0) 100%)`;
      }
      const a = 0.3 + 0.3 * (altitude / 0.2);
      return `linear-gradient(180deg, rgba(200,100,40,${a}) 0%, rgba(195,130,70,${a*0.7}) 35%, rgba(230,190,140,${a*0.3}) 65%, rgba(250,246,240,0) 100%)`;
    }
    if (isDusk) {
      const f = (h - sunSet) / (20 - sunSet);
      return `linear-gradient(180deg, rgba(50,30,70,${0.35*(1-f)}) 0%, rgba(80,40,60,${0.2*(1-f)}) 40%, rgba(150,80,50,${0.1*(1-f)}) 70%, rgba(250,246,240,0) 100%)`;
    }
    if (isDawn) {
      const f = (h - 4.5) / (sunRise - 4.5);
      return `linear-gradient(180deg, rgba(200,100,40,${0.3*f}) 0%, rgba(190,120,70,${0.2*f}) 40%, rgba(230,180,130,${0.1*f}) 70%, rgba(250,246,240,0) 100%)`;
    }
    return `linear-gradient(180deg, rgba(10,10,35,0.35) 0%, rgba(15,15,45,0.2) 40%, rgba(20,20,50,0.08) 70%, rgba(250,246,240,0) 100%)`;
  })();

  // Sun Y position — higher on mobile for better visibility
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const sunY = isMobile
    ? 30 - altitude * 28   // range: 30% (horizon) → 2% (noon peak)
    : 40 - altitude * 38;  // range: 40% (horizon) → 2% (noon peak)

  // Sun appearance
  const sunCore = altitude > 0.5 ? '#fff8e0' : altitude > 0.2 ? '#ffd080' : '#ff8030';
  const glowSize = 60 + 40 * altitude;
  const glowColor = altitude > 0.5
    ? `rgba(255,240,180,${0.15 + 0.2 * altitude})`
    : `rgba(255,140,40,${0.1 + 0.15 * altitude})`;

  const greeting = lang === 'zh'
    ? (h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好')
    : (h < 6 ? 'Good Night' : h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening');

  return (
    <>
      {/* Fixed sky background behind navbar */}
      <div
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{ height: 'clamp(160px, 35vw, 280px)', background: skyGradient, transition: 'background 2s ease', zIndex: 0 }}
      />

      {/* Content spacer */}
      <div style={{ height: 'clamp(120px, 25vw, 200px)', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }} className="relative">

      {/* Stars at night */}
      {(isNight || (isDusk && brightness < 0.1) || (isDawn && brightness < 0.1)) && (
        <div className="absolute inset-0" style={{ opacity: isNight ? 0.6 : 0.25 }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const seed = i * 137.5;
            return (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: `${1 + (i % 3) * 0.5}px`,
                  height: `${1 + (i % 3) * 0.5}px`,
                  left: `${(seed * 7.3) % 92 + 4}%`,
                  top: `${(seed * 3.7) % 60 + 5}%`,
                  opacity: 0.3 + (i % 4) * 0.15,
                  animation: `twinkle ${2.5 + (i % 3) * 1.5}s ease-in-out infinite`,
                  animationDelay: `${(i * 0.3) % 4}s`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Shooting stars at night */}
      {(isNight || (isDusk && brightness < 0.1)) && (
        <div className="absolute inset-0" style={{ opacity: isNight ? 0.8 : 0.3, overflow: 'hidden' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${25 + i * 25}%`,
                top: `${5 + i * 12}%`,
                width: '2px',
                height: '2px',
                background: '#fff',
                borderRadius: '50%',
                boxShadow: '0 0 4px 1px rgba(255,255,255,0.6), -8px 0 6px rgba(255,255,255,0.3), -20px 0 8px rgba(255,255,255,0.15)',
                animation: `shootingStar ${4 + i * 2}s ease-in infinite`,
                animationDelay: `${i * 5 + 3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Moon */}
      {(isNight || isDusk) && (
        <div
          className="absolute transition-all duration-[2000ms]"
          style={{
            left: `${isNight ? 70 : 85}%`,
            top: '12%',
            opacity: isNight ? 0.75 : Math.min(0.5, (h - sunSet) * 0.3),
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="7" fill="#e8dcc0" opacity="0.85" />
            <circle cx="14" cy="7" r="5.5" fill="var(--color-bg)" />
          </svg>
        </div>
      )}

      {/* Sun glow */}
      {isDay && (
        <div
          className="absolute rounded-full transition-all duration-[2000ms]"
          style={{
            width: `${glowSize}px`,
            height: `${glowSize}px`,
            left: `calc(${sunX}% - ${glowSize / 2}px)`,
            top: `calc(${sunY}% - ${glowSize / 2}px)`,
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Sun disc */}
      {isDay && (
        <div
          className="absolute rounded-full transition-all duration-[2000ms]"
          style={{
            width: '16px',
            height: '16px',
            left: `calc(${sunX}% - 8px)`,
            top: `calc(${sunY}% - 8px)`,
            background: `radial-gradient(circle at 35% 35%, ${sunCore}, ${altitude > 0.3 ? '#ffe090' : '#d06020'})`,
            boxShadow: `0 0 ${8 + 12 * altitude}px ${altitude > 0.5 ? `rgba(255,220,100,${0.3 + 0.3 * altitude})` : `rgba(255,140,40,${0.2 + 0.2 * altitude})`}`,
          }}
        />
      )}

      {/* Top left: lunar date + greeting */}
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
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
        @keyframes shootingStar {
          0% { transform: translate(0, 0) rotate(-35deg); opacity: 0; }
          2% { opacity: 1; }
          15% { opacity: 1; }
          30% { transform: translate(-160px, 90px) rotate(-35deg); opacity: 0; }
          100% { transform: translate(-160px, 90px) rotate(-35deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      </div>
    </>
  );
}
