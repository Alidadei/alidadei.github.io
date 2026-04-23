import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';

export function mountAdminApp(container: HTMLElement) {
  const root = createRoot(container);
  root.render(React.createElement(AdminApp));
}
