import { lazy } from 'react';
// Создаем lazy-компонент для админ-панели
export const AdminPanel = lazy(() => import('./AdminPanel'));
