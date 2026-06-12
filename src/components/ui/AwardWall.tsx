import { useState, useEffect, useCallback } from 'react';

interface AwardWallProps {
  lang: 'zh' | 'en';
}

// Featured image in center
const featuredImage = '/images/相辉奖状.jpg';

// Images positioned around the featured one
const positionedImages = {
  left: '/images/第五届海工.jpg',
  right: '/images/第四届国际海洋工程准备科技创新大赛.jpg',
  bottomLeft: '/images/华为HSD证书.jpg',
  bottomRight: '/images/实习证明-华为.png',
};

// Remaining images for the bottom row
const otherImages = [
  '/images/二等奖学金.jpg',
  '/images/优秀学生.jpg',
  '/images/第十四届蓝桥杯电子赛省奖.jpg',
  '/images/山东省机器人大赛三等奖.jpg',
  '/images/全国英语阅读比赛一等奖.png',
  '/images/2023全国大学生商务英语竟赛二等奖.jpg',
  '/images/美赛S奖2428151.jpg',
  '/images/三年成绩不断进步.jpg',
];

export default function AwardWall({ lang }: AwardWallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
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

  const baseDelay = (row: number, col: number) => (row * 0.08 + col * 0.06);

  return (
    <>
      {/* Trigger button at page bottom */}
      <div className="flex justify-center mt-8">
        <button
          onClick={open}
          className="group relative opacity-40 hover:opacity-80 transition-opacity duration-500 cursor-pointer p-3"
          aria-label={hintText}
          title={hintText}
        >
          <svg
            width="28" height="28" viewBox="0 0 64 64" fill="none"
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

      {/* Full-screen overlay */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 transition-colors duration-400 ${visible ? 'bg-black/85' : 'bg-black/0'}`}
          onClick={close}
        >
          {/* Close hint */}
          <div className={`absolute top-4 right-6 text-white/60 text-sm z-50 transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            {lang === 'zh' ? '点击空白处或按 ESC 关闭' : 'Click anywhere or press ESC to close'}
          </div>

          {/* Scrollable content */}
          <div className="absolute inset-0 overflow-auto flex flex-col items-center py-8 px-4" onClick={(e) => e.stopPropagation()}>

            {/* Main layout: featured + 4 positioned around */}
            <div className="w-full max-w-5xl mt-8 mb-6">
              {/* Top row: left | featured | right */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-4 items-end">
                {/* Left: 海工赛1 */}
                <div
                  className="overflow-hidden rounded-lg"
                  style={{
                    height: '200px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateX(0)' : 'translateX(-30px)',
                    transition: `opacity 0.5s ease ${baseDelay(0,0)}s, transform 0.5s ease ${baseDelay(0,0)}s`,
                  }}
                >
                  <img src={positionedImages.left} alt="" className="w-full h-full object-cover shadow-xl" loading="lazy" />
                </div>

                {/* Center: 相辉奖状 (featured) */}
                <div
                  className="overflow-hidden rounded-lg border-2 border-yellow-400/50 relative"
                  style={{
                    height: '300px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
                    transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
                    boxShadow: '0 0 40px rgba(255,215,0,0.3), 0 8px 32px rgba(0,0,0,0.4)',
                  }}
                >
                  <img src={featuredImage} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <span className="text-white/90 text-sm font-medium">
                      {lang === 'zh' ? '复旦大学相辉博士奖学金' : 'Fudan Xianghui Doctoral Scholarship'}
                    </span>
                  </div>
                </div>

                {/* Right: 海工赛2 */}
                <div
                  className="overflow-hidden rounded-lg"
                  style={{
                    height: '200px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateX(0)' : 'translateX(30px)',
                    transition: `opacity 0.5s ease ${baseDelay(0,2)}s, transform 0.5s ease ${baseDelay(0,2)}s`,
                  }}
                >
                  <img src={positionedImages.right} alt="" className="w-full h-full object-cover shadow-xl" loading="lazy" />
                </div>
              </div>

              {/* Bottom row: bottomLeft | spacer | bottomRight */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-4 mt-4">
                {/* Bottom-left: 华为HSD */}
                <div
                  className="overflow-hidden rounded-lg"
                  style={{
                    height: '180px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(30px)',
                    transition: `opacity 0.5s ease ${baseDelay(1,0)}s, transform 0.5s ease ${baseDelay(1,0)}s`,
                  }}
                >
                  <img src={positionedImages.bottomLeft} alt="" className="w-full h-full object-cover shadow-xl" loading="lazy" />
                </div>

                {/* Bottom center spacer */}
                <div />

                {/* Bottom-right: 实习证明 */}
                <div
                  className="overflow-hidden rounded-lg"
                  style={{
                    height: '180px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(30px)',
                    transition: `opacity 0.5s ease ${baseDelay(1,2)}s, transform 0.5s ease ${baseDelay(1,2)}s`,
                  }}
                >
                  <img src={positionedImages.bottomRight} alt="" className="w-full h-full object-cover shadow-xl" loading="lazy" />
                </div>
              </div>
            </div>

            {/* Other images in a scrollable row */}
            <div className="w-full max-w-5xl">
              <div className="flex gap-3 overflow-x-auto pb-4">
                {otherImages.map((src, i) => (
                  <div
                    key={i}
                    className="shrink-0 overflow-hidden rounded-lg"
                    style={{
                      width: '180px',
                      height: '140px',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(20px)',
                      transition: `opacity 0.4s ease ${0.4 + i * 0.06}s, transform 0.4s ease ${0.4 + i * 0.06}s`,
                    }}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover shadow-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
