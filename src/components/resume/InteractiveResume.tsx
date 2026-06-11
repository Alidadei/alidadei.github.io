import { useState, useEffect, useRef, useCallback } from 'react';

interface InteractiveResumeProps {
  lang: 'zh' | 'en';
  sectionOrder: string[];
}

export default function InteractiveResume({ lang, sectionOrder }: InteractiveResumeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const initialized = useRef(false);

  // Initialize: wrap each data-section into accordion
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const container = document.getElementById('resume-content');
    if (!container) return;

    sectionOrder.forEach((id) => {
      const section = container.querySelector(`[data-section="${id}"]`) as HTMLElement;
      if (!section) return;

      const titleEl = section.querySelector(':scope > h2') as HTMLElement;
      if (!titleEl) return;

      // Create accordion header
      const header = document.createElement('button');
      header.className = 'cv-accordion-header w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg-secondary)] transition-colors text-left cursor-pointer';
      header.dataset.sectionId = id;
      header.innerHTML = `
        <span class="font-bold text-lg text-[var(--color-text-primary)]">${titleEl.textContent}</span>
        <span class="cv-accordion-arrow text-[var(--color-text-muted)] transition-transform duration-300 rotate-180">▼</span>
      `;

      // Create body wrapper
      const body = document.createElement('div');
      body.className = 'cv-accordion-body overflow-hidden transition-[max-height] duration-300 ease-in-out';
      body.style.maxHeight = '2000px';

      // Move all children except h2 into body
      const children = Array.from(section.children);
      children.forEach((child) => {
        if (child !== titleEl && child.tagName !== 'H2') {
          body.appendChild(child);
        }
      });

      // Hide original h2
      titleEl.style.display = 'none';

      // Insert header and body into section
      section.insertBefore(header, section.firstChild);
      section.appendChild(body);
    });
  }, [sectionOrder]);

  // Click handler via event delegation on document
  useEffect(() => {
    const handleClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest('.cv-accordion-header') as HTMLElement;
      if (!target) return;

      const id = target.dataset.sectionId;
      if (!id) return;

      const body = target.nextElementSibling as HTMLElement;
      const arrow = target.querySelector('.cv-accordion-arrow') as HTMLElement;
      if (!body) return;

      const isCurrentlyOpen = body.style.maxHeight !== '0px';
      if (isCurrentlyOpen) {
        body.style.maxHeight = '0px';
        if (arrow) arrow.style.transform = '';
      } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const labels = {
    zh: { export: '📄 导出 PDF', collapse: '全部收起', expand: '全部展开' },
    en: { export: '📄 Export PDF', collapse: 'Collapse all', expand: 'Expand all' },
  };
  const t = labels[lang];

  const toggleAll = () => {
    const allOpen = sectionOrder.every((id) => {
      const header = document.querySelector(`.cv-accordion-header[data-section-id="${id}"]`);
      if (!header) return true;
      const body = header.nextElementSibling as HTMLElement;
      return body && body.style.maxHeight !== '0px';
    });

    sectionOrder.forEach((id) => {
      const header = document.querySelector(`.cv-accordion-header[data-section-id="${id}"]`) as HTMLElement;
      if (!header) return;
      const body = header.nextElementSibling as HTMLElement;
      const arrow = header.querySelector('.cv-accordion-arrow') as HTMLElement;

      if (allOpen) {
        if (body) body.style.maxHeight = '0px';
        if (arrow) arrow.style.transform = '';
      } else {
        if (body) body.style.maxHeight = body.scrollHeight + 'px';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });
  };

  const exportPdf = () => {
    sectionOrder.forEach((id) => {
      const header = document.querySelector(`.cv-accordion-header[data-section-id="${id}"]`) as HTMLElement;
      if (!header) return;
      const body = header.nextElementSibling as HTMLElement;
      const arrow = header.querySelector('.cv-accordion-arrow') as HTMLElement;
      if (body) body.style.maxHeight = body.scrollHeight + 'px';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    });
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
          {t.collapse}
        </button>
      </div>
    </div>
  );
}
