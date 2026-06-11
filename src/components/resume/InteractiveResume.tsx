import { useState, useEffect, useCallback } from 'react';

interface InteractiveResumeProps {
  lang: 'zh' | 'en';
  sectionOrder: string[];
}

export default function InteractiveResume({ lang, sectionOrder }: InteractiveResumeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On mount, wrap each [data-section] into an accordion panel
    const container = document.getElementById('resume-content');
    if (!container) return;

    sectionOrder.forEach((id) => {
      const section = container.querySelector(`[data-section="${id}"]`) as HTMLElement;
      if (!section) return;

      // Don't re-wrap if already wrapped
      if (section.parentElement?.classList.contains('accordion-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'accordion-wrapper border border-border rounded-lg overflow-hidden';

      const header = document.createElement('button');
      header.className = 'accordion-header w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg-secondary)] transition-colors text-left cursor-pointer';
      header.dataset.section = id;

      const titleEl = section.querySelector('h2');
      const titleText = titleEl?.textContent || id;
      if (titleEl) titleEl.style.display = 'none';

      header.innerHTML = `
        <span class="flex items-center gap-2">
          <span class="font-bold text-lg text-[var(--color-text-primary)]">${titleText}</span>
        </span>
        <span class="accordion-arrow text-[var(--color-text-muted)] transition-transform duration-300">▼</span>
      `;

      const body = document.createElement('div');
      body.className = 'accordion-body transition-all duration-300 overflow-hidden';
      body.style.maxHeight = '0px';

      // Move section content into body
      while (section.firstChild) {
        body.appendChild(section.firstChild);
      }
      section.appendChild(body);

      wrapper.appendChild(header);
      section.parentNode?.insertBefore(wrapper, section);
      wrapper.appendChild(section);
    });

    setMounted(true);
  }, [sectionOrder]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const newState = { ...prev, [id]: !prev[id] };
      const isNowCollapsed = newState[id];

      const body = document.querySelector(`[data-section="${id}"] .accordion-body`) as HTMLElement;
      const arrow = document.querySelector(`[data-section="${id}"] .accordion-arrow`) as HTMLElement;

      if (body) {
        if (isNowCollapsed) {
          body.style.maxHeight = '0px';
        } else {
          body.style.maxHeight = body.scrollHeight + 'px';
        }
      }
      if (arrow) {
        arrow.style.transform = isNowCollapsed ? '' : 'rotate(180deg)';
      }

      return newState;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Attach click handlers
    const handlers: Record<string, () => void> = {};
    sectionOrder.forEach((id) => {
      const header = document.querySelector(`[data-section="${id}"] .accordion-header`) as HTMLElement;
      if (!header) return;
      const handler = () => toggle(id);
      handlers[id] = handler;
      header.addEventListener('click', handler);

      // Expand by default
      const body = document.querySelector(`[data-section="${id}"] .accordion-body`) as HTMLElement;
      const arrow = document.querySelector(`[data-section="${id}"] .accordion-arrow`) as HTMLElement;
      if (body) {
        body.style.maxHeight = body.scrollHeight + 'px';
      }
      if (arrow) {
        arrow.style.transform = 'rotate(180deg)';
      }
    });

    return () => {
      sectionOrder.forEach((id) => {
        const header = document.querySelector(`[data-section="${id}"] .accordion-header`);
        if (header && handlers[id]) {
          header.removeEventListener('click', handlers[id]);
        }
      });
    };
  }, [mounted, sectionOrder, toggle]);

  const labels = {
    zh: { export: '📄 导出 PDF', collapse: '全部收起', expand: '全部展开' },
    en: { export: '📄 Export PDF', collapse: 'Collapse all', expand: 'Expand all' },
  };

  const t = labels[lang];
  const allCollapsed = sectionOrder.every((id) => collapsed[id]);

  const toggleAll = () => {
    const newState: Record<string, boolean> = {};
    const willCollapse = !allCollapsed;
    sectionOrder.forEach((id) => {
      newState[id] = willCollapse;
      const body = document.querySelector(`[data-section="${id}"] .accordion-body`) as HTMLElement;
      const arrow = document.querySelector(`[data-section="${id}"] .accordion-arrow`) as HTMLElement;
      if (body) body.style.maxHeight = willCollapse ? '0px' : body.scrollHeight + 'px';
      if (arrow) arrow.style.transform = willCollapse ? '' : 'rotate(180deg)';
    });
    setCollapsed(newState);
  };

  const exportPdf = () => {
    // Expand all before printing
    const newState: Record<string, boolean> = {};
    sectionOrder.forEach((id) => {
      newState[id] = false;
      const body = document.querySelector(`[data-section="${id}"] .accordion-body`) as HTMLElement;
      const arrow = document.querySelector(`[data-section="${id}"] .accordion-arrow`) as HTMLElement;
      if (body) body.style.maxHeight = body.scrollHeight + 'px';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    });
    setCollapsed(newState);
    setTimeout(() => window.print(), 200);
  };

  return (
    <div className="mb-8">
      <div className="flex gap-2">
        <button
          onClick={exportPdf}
          className="px-4 py-2 text-sm rounded-lg bg-[var(--color-text-primary)] text-white hover:opacity-90 transition-colors cursor-pointer"
        >
          {t.export}
        </button>
        <button
          onClick={toggleAll}
          className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
        >
          {allCollapsed ? t.expand : t.collapse}
        </button>
      </div>
    </div>
  );
}
