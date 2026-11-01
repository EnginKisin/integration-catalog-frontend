import type { SVGProps } from 'react'

const paths = {
  flow: 'M2 3h5v5H2zm11 9h5v5h-5zM13 3h5v5h-5zM7 5.5h6M4.5 8v6.5H13',
  download: 'M10 2v11m-4-4 4 4 4-4M3 14v4h14v-4',
  print: 'M5 7V2h10v5M5 14H2V7h16v7h-3M5 11h10v7H5zm10-1h.01',
  filter: 'M2 3h16l-6 7v6l-4 2v-8L2 3z',
  fit: 'M7 2H2v5m11-5h5v5M2 13v5h5m6 0h5v-5',
  sparkles: 'm10 2 2.2 5.8L18 10l-5.8 2.2L10 18l-2.2-5.8L2 10l5.8-2.2L10 2zm6-1v4m-2-2h4M3 15v4m-2-2h4',
  catalog: 'M3 3h5v5H3zm9 0h5v5h-5zM3 12h5v5H3zm9 0h5v5h-5z',
  server: 'M3 3h14v5H3zm0 9h14v5H3zM6 5.5h.01M6 14.5h.01M10 8v4',
  users: 'M13 17v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m10-14a3 3 0 0 1 0 6m4 8v-2a4 4 0 0 0-3-3M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  user: 'M17 18v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2M14 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  plus: 'M10 4v12M4 10h12',
  arrow: 'M3 10h14m-5-5 5 5-5 5',
  back: 'M17 10H3m5-5-5 5 5 5',
  refresh: 'M17 8a7 7 0 0 0-12-4L2 7m0-5v5h5m-4 5a7 7 0 0 0 12 4l3-3m0 5v-5h-5',
  link: 'm8 12 4-4m-6 3-1 1a3 3 0 0 0 4 4l3-3m-4-6 3-3a3 3 0 0 1 4 4l-1 1',
  layers: 'm10 2 8 4-8 4-8-4 8-4zm-8 8 8 4 8-4m-16 4 8 4 8-4',
  check: 'm4 10 4 4 8-8',
  shield: 'm10 2 7 3v5c0 4-7 8-7 8s-7-4-7-8V5l7-3zm-3 8 2 2 4-4',
  code: 'm6 5-5 5 5 5m8-10 5 5-5 5m-3-12-2 14',
  key: 'M9 9a4 4 0 1 1-6-6 4 4 0 0 1 6 6zm0 0 9 9m-3-3 2-2m-5-1 2-2',
  mail: 'M2 4h16v12H2zm0 1 8 6 8-6',
  clock: 'M10 5v5l3 2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  search: 'm14 14 4 4M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0',
  chevron: 'm7 4 6 6-6 6',
  logout: 'M8 3H3v14h5m-1-7h11m-4-4 4 4-4 4',
  menu: 'M3 5h14M3 10h14M3 15h14',
  info: 'M10 9v5m0-8h.01M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  file: 'M11 2H4v16h12V7l-5-5zm0 0v5h5M7 11h6m-6 3h4',
  upload: 'M10 13V2m-4 4 4-4 4 4M3 12v6h14v-6',
}

export type IconName = keyof typeof paths

export function AppIcon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" className={`app-icon ${className}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name]} /></svg>
}
