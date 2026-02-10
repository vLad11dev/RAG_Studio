declare module '*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
}

declare module '*.tsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
}

declare module './components/Admin/AdminPanel' {
  import { ComponentType } from 'react';
  const component: ComponentType;
  export default component;
}