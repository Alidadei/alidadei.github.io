import { useState } from 'react';

interface TimelineItem {
  date: string;
  title: string;
  description: string;
  type: 'education' | 'research' | 'competition' | 'award' | 'other';
}

const typeConfig = {
  education: { color: 'bg-accent', icon: '🎓' },
  research: { color: 'bg-primary', icon: '🔬' },
  competition: { color: 'bg-success', icon: '🏆' },
  award: { color: 'bg-warning', icon: '🎖' },
  other: { color: 'bg-text-muted', icon: '📌' },
};

const labels = {
  zh: { showMore: '展开更多', showLess: '收起' },
  en: { showMore: 'Show more', showLess: 'Show less' },
};

export default function Timeline({ items, lang }: { items: TimelineItem[]; lang: 'zh' | 'en' }) {
  const [expanded, setExpanded] = useState(false);
  const t = labels[lang];
  const visible = expanded ? items : items.slice(0, 4);

  return (
    <div>
      <div className="relative border-l-2 border-accent/30 ml-3 sm:ml-4 space-y-6">
        {visible.map((item, i) => {
          const config = typeConfig[item.type];
          return (
            <div key={i} className="relative pl-6 sm:pl-8 fade-in">
              <div className={`absolute -left-2 top-1 w-4 h-4 rounded-full ${config.color} border-2 border-bg`} />
              <div className="p-4 rounded-lg border border-border hover:border-accent/30 transition-all">
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-lg">{config.icon}</span>
                  <h3 className="font-semibold text-primary">{item.title}</h3>
                </div>
                <p className="text-sm text-text-muted mb-1">{item.date}</p>
                <p className="text-sm text-text-secondary">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 ml-6 sm:ml-12 text-sm text-accent hover:text-accent-light transition-colors"
        >
          {expanded ? t.showLess : t.showMore} ({items.length - 4} {lang === 'zh' ? '项' : 'items'})
        </button>
      )}
    </div>
  );
}
