import { useState, useEffect, useCallback } from 'react';

interface AwardWallProps {
  lang: 'zh' | 'en';
}

const awardImages = [
  '/images/二等奖学金.jpg',
  '/images/优秀学生.jpg',
  '/images/第十四届蓝桥杯电子赛省奖.jpg',
  '/images/山东省机器人大赛三等奖.jpg',
  '/images/华为HSD证书.jpg',
  '/images/全国英语阅读比赛一等奖.png',
  '/images/2023全国大学生商务英语竟赛二等奖.jpg',
  '/images/美赛S奖2428151.jpg',
  '/images/第五届海工.jpg',
  '/images/三年成绩不断进步.jpg',
];

interface ScatteredItem {
  src: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  floatDelay: number;
  floatDuration: number;
}

function generateScatter(): ScatteredItem[] {
  return awardImages.map((src, i) => ({
    src,
    x: 5 + Math.random() * 70,  // 5-75% from left
    y: 5 + Math.random() * 70,  // 5-75% from top
    rotation: -15 + Math.random() * 30, // -15 to +15 degrees
    scale: 0.7 + Math.random() * 0.5,  // 0.7 to 1.2
    floatDelay: i * 0.3,
    floatDuration: 3 + Math.random() * 2, // 3-5s float cycle
  }));
}

export default function AwardWall({ lang }: AwardWallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<ScatteredItem[]>([]);
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    setItems(generateScatter());
    setIsOpen(true);
    // Trigger enter animation after mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setIsOpen(false), 400);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  const hintText = lang === 'zh' ? '点我看看~' : 'Click me~';

  return (
    <>
      {/* Trigger: small trophy icon */}
      <div className="flex justify-center mt-6">
        <button
          onClick={open}
          className="group relative opacity-40 hover:opacity-80 transition-opacity duration-500 cursor-pointer"
          aria-label={hintText}
          title={hintText}
        >
          {/* Cartoon trophy SVG */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
          >
            {/* Cup body */}
            <path d="M16 12h32v24c0 8-7 14-16 14s-16-6-16-14V12z" fill="#FFD700" stroke="#DAA520" strokeWidth="2"/>
            {/* Cup handles */}
            <path d="M16 16c-8 0-12 4-12 10s4 10 12 10" fill="none" stroke="#DAA520" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M48 16c8 0 12 4 12 10s-4 10-12 10" fill="none" stroke="#DAA520" strokeWidth="2.5" strokeLinecap="round"/>
            {/* Star on cup */}
            <path d="M32 20l2.5 5 5.5.8-4 3.9.9 5.5L32 32.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z" fill="#FFF8DC"/>
            {/* Stem */}
            <rect x="28" y="40" width="8" height="8" rx="1" fill="#DAA520"/>
            {/* Base */}
            <rect x="22" y="48" width="20" height="4" rx="2" fill="#DAA520"/>
          </svg>
          {/* Hover hint text */}
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            {hintText}
          </span>
        </button>
      </div>

      {/* Full-screen scattered photo wall overlay */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 transition-colors duration-400 ${visible ? 'bg-black/70' : 'bg-black/0'}`}
          onClick={close}
        >
          {/* Close hint */}
          <div className={`absolute top-4 right-6 text-white/60 text-sm transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            {lang === 'zh' ? '点击空白处或按 ESC 关闭' : 'Click anywhere or press ESC to close'}
          </div>

          {/* Scattered images */}
          {items.map((item, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `rotate(${item.rotation}deg) scale(${item.scale})`,
                opacity: visible ? 1 : 0,
                transition: `opacity 0.6s ease ${item.floatDelay}s, transform 0.6s ease ${item.floatDelay}s`,
                animation: visible ? `awardFloat ${item.floatDuration}s ease-in-out ${item.floatDelay}s infinite alternate` : 'none',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={item.src}
                alt=""
                className="w-36 h-28 object-cover rounded shadow-xl border-2 border-white/30"
                style={{
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Float animation keyframes */}
      <style>{`
        @keyframes awardFloat {
          0% { transform: rotate(var(--base-rotation, 0deg)) translateY(0px); }
          100% { transform: rotate(var(--base-rotation, 0deg)) translateY(-8px); }
        }
      `}</style>
    </>
  );
}
