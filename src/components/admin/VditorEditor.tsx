import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { useEffect, useRef } from 'react';

interface Props {
  initialValue: string;
  onChange: (markdown: string) => void;
  // 上传一张图片,返回要插入正文的 markdown(走 Worker 的 /api/images/upload)
  onUploadImage: (file: File) => Promise<string>;
}

// Vditor 封装:IR(即时渲染)模式,源数据始终是 Markdown。
// 运行时资源(lute/katex/highlight.js 等)由 scripts/copy-vditor.mjs 部署到本站 /vditor。
// initialValue 仅在挂载时消费;切换文章应由父组件用 key 重新挂载本组件。
export default function VditorEditor({ initialValue, onChange, onUploadImage }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const uploadRef = useRef(onUploadImage);
  onChangeRef.current = onChange;
  uploadRef.current = onUploadImage;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // 窄屏砍掉低频按钮,防止工具栏横向溢出(挂载时决定,不做动态重排)
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    const toolbar = narrow
      ? ['headings', 'bold', 'italic', '|', 'list', 'quote', 'code', '|', 'upload', 'undo', 'edit-mode']
      : [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', 'quote', '|',
        'code', 'inline-code', 'table', 'link', 'upload', '|',
        'undo', 'redo', '|', 'fullscreen', 'edit-mode',
      ];
    const vditor = new Vditor(el, {
      cdn: '/vditor',
      mode: 'ir',
      theme: dark ? 'dark' : 'classic',
      value: initialValue,
      placeholder: '正文(Markdown,支持 $LaTeX$ 公式、代码块、表格)',
      height: narrow ? 'calc(100vh - 360px)' : 'calc(100vh - 300px)',
      toolbar,
      cache: { enable: false },
      input: (md) => onChangeRef.current(md),
      upload: {
        accept: 'image/png,image/jpeg,image/gif,image/webp',
        multiple: false,
        handler: async (files) => {
          for (const file of files) {
            try {
              const markdown = await uploadRef.current(file);
              vditor.insertValue(`\n${markdown}\n`);
            } catch (e) {
              return e instanceof Error ? e.message : '上传失败';
            }
          }
          return null;
        },
      },
    });
    return () => { vditor.destroy(); };
    // initialValue/onChange/onUploadImage 经 ref 转发,只依赖挂载
  }, []);

  return <div ref={elRef} />;
}
