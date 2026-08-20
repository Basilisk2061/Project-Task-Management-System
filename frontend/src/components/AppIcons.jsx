const iconProps = {
  width: 19,
  height: 19,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function DashboardIcon() {
  return <svg {...iconProps}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
}

export function FolderIcon() {
  return <svg {...iconProps}><path d="M3.5 7.5v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-6l-2-3h-5a2 2 0 0 0-2 2Z" /></svg>
}

export function TasksIcon() {
  return <svg {...iconProps}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></svg>
}

export function LogoutIcon() {
  return <svg {...iconProps}><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /><path d="m15 8 4 4-4 4M19 12H9" /></svg>
}

export function PlusIcon() {
  return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
}

export function EditIcon() {
  return <svg {...iconProps}><path d="M13.5 6.5 17.5 10.5M5 19l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L5.7 15.2Z" /></svg>
}

export function TrashIcon() {
  return <svg {...iconProps}><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5" /></svg>
}

export function CloseIcon() {
  return <svg {...iconProps}><path d="m6 6 12 12M18 6 6 18" /></svg>
}

export function DragHandleIcon() {
  return <svg {...iconProps}><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" /></svg>
}
