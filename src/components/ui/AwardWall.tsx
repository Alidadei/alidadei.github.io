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

interface WaterfallItem {
  src: string;
  col: number;
  height: number;  // display height based on aspect
}

function generateWaterfall(cols: number): WaterfallItem[] {
  const colHeights = new Array(cols).fill(0);
  return awardImages.map((src) => {
    // Find shortest column
    const minCol = colHeights.indexOf(Math.min(...colHeights));
    const h = 160 + Math.floor(Math.random() * 80); // 160-240px height
    colHeights[minCol] += h + 12; // 12px gap
    return { src, col: minCol, height: h };
  });
}

export default function AwardWall({ lang }: AwardWallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<WaterfallItem[]>([]);
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    setItems(generateWaterfall(3));
    setIsOpen(true);
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
          <svg
            width="28"
            height="28"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
          >
            <path d="M16 12h32v24c0 8-7 14-16 14s-16-6-16-14V12z" fill="#FFD700" stroke="#DAA520" strokeWidth="2"/>
            <path d="M16 16c-8 0-12 4-12 10s4 10 12 10" fill="none" stroke="#DAA520" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M48 16c8 0 12 4 12 10s-4 10-12 10" fill="none" stroke="#DAA520" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M32 20l2.5 5 5.5.8-4 3.9.9 5.5L32 32.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z" fill="#FFF8DC"/>
            <rect x="28" y="40" width="8" height="8" rx="1" fill="#DAA520"/>
            <rect x="22" y="48" width="20" height="4" rx="2" fill="#DAA520"/>
          </svg>
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            {hintText}
          </span>
        </button>
      </div>

      {/* Full-screen waterfall overlay */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 transition-colors duration-400 ${visible ? 'bg-black/80' : 'bg-black/0'}`}
          onClick={close}
        >
          {/* Close hint */}
          <div className={`absolute top-4 right-6 text-white/60 text-sm transition-opacity duration-400 z-50 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            {lang === 'zh' ? '点击空白处或按 ESC 关闭' : 'Click anywhere or press ESC to close'}
          </div>

          {/* Waterfall layout */}
          <div className="absolute inset-8 flex justify-center items-start overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3 w-full max-w-4xl">
              {[0, 1, 2].map((colIndex) => (
                <div key={colIndex} className="flex-1 flex flex-col gap-3">
                  {items
                    .filter((item) => item.col === colIndex)
                    .map((item, i) => (
                      <div
                        key={i}
                        className="relative overflow-hidden rounded-lg"
                        style={{
                          height: `${item.height}px`,
                          opacity: visible ? 1 : 0,
                          transform: visible ? 'translateY(0)' : 'translateY(30px)',
                          transition: `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`,
                        }}
                      >
                        <img
                          src={item.src}
                          alt=""
                          className="w-full h-full object-cover"
                          style={{
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                          }}
                        />
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
