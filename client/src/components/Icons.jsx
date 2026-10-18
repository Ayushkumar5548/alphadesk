// Tiny hand-rolled SVG icon set (no icon library).

const base = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
};

export function WatchIcon(p) {
  return <svg {...base} {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" /></svg>;
}
export function PicksIcon(p) {
  return <svg {...base} {...p}><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" /></svg>;
}
export function FilterIcon(p) {
  return <svg {...base} {...p}><path d="M3.5 5h17l-6.6 7.8V19l-3.8 2v-8.2L3.5 5z" /></svg>;
}
export function CalendarIcon(p) {
  return <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>;
}
export function ChartIcon(p) {
  return <svg {...base} {...p}><path d="M3.5 20.5h17M6 16V9M11 16V5M16 16v-5" /></svg>;
}
export function SavedIcon(p) {
  return <svg {...base} {...p}><path d="M6 3.5h12a1 1 0 011 1V21l-7-4-7 4V4.5a1 1 0 011-1z" /></svg>;
}
export function AiIcon(p) {
  return <svg {...base} {...p}><path d="M21 12a8.5 8.5 0 01-8.5 8.5c-1.5 0-3-.4-4.2-1L3 21l1.6-4.4A8.5 8.5 0 1121 12z" /><path d="M9 11h.01M12.5 11h.01M16 11h.01" /></svg>;
}
export function SearchIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>;
}
export function PlusIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M12 5v14M5 12h14" /></svg>;
}
export function TrashIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" /></svg>;
}
export function BellIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9zM10 18.5a2 2 0 004 0" /></svg>;
}
export function NoteIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M5 3.5h9.5L19 8v12.5H5z" /><path d="M14 3.5V8h5M8 12h8M8 16h5" /></svg>;
}
export function LinkIcon(p) {
  return <svg {...base} width={14} height={14} {...p}><path d="M10 14a4 4 0 006 0l3-3a4 4 0 10-6-6l-1.5 1.5M14 10a4 4 0 00-6 0l-3 3a4 4 0 106 6l1.5-1.5" /></svg>;
}
export function DownloadIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 20.5h16" /></svg>;
}
export function ChevronLeft(p) {
  return <svg {...base} width={16} height={16} {...p}><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>;
}
export function ChevronRight(p) {
  return <svg {...base} width={16} height={16} {...p}><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>;
}
export function ChevronDown(p) {
  return <svg {...base} width={15} height={15} {...p}><path d="M5.5 9L12 15.5 18.5 9" /></svg>;
}
export function StarOutline(p) {
  return <svg {...base} width={16} height={16} {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" /></svg>;
}
export function StarFilled(p) {
  return <svg {...base} width={16} height={16} fill="currentColor" stroke="none" {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" /></svg>;
}
export function CopyIcon(p) {
  return <svg {...base} width={15} height={15} {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 5.5h-10a2 2 0 00-2 2v10" /></svg>;
}
export function XIcon(p) {
  return <svg {...base} width={14} height={14} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
