import {
  Sun, Inbox, Mic, Target, History, Wallet, Briefcase, Mail, Users, Home, CalendarDays, Settings,
} from 'lucide-react'

// Existing dashboards, linked until each one moves into the app (Phase 4)
export const sections = [
  { path: '/', label: 'Today', icon: Sun },
  { path: '/inbox', label: 'Inbox', icon: Inbox, badge: true },
  { path: '/brain-dump', label: 'Brain Dump', icon: Mic },
  { path: '/goals', label: 'Goals & Ideas', icon: Target },
  { path: '/timeline', label: 'Timeline', icon: History },
  { path: '/finances', label: 'Finances', icon: Wallet, legacy: 'https://claude.ai/code/artifact/48fa1f59-316e-44c7-9bbe-8052b7446eee' },
  { path: '/jobs', label: 'Jobs', icon: Briefcase, legacy: 'https://claude.ai/code/artifact/94c1d4fb-5a22-4cb3-8c2d-bde80507dbd2' },
  { path: '/email', label: 'Email', icon: Mail, legacy: 'https://claude.ai/code/artifact/bd40cf73-93da-4cbd-9ec7-4bc11bb278d1' },
  { path: '/clients', label: 'Clients', icon: Users, legacy: 'https://claude.ai/code/artifact/84558951-84a9-4d63-b9d7-6720723b01a2' },
  { path: '/housing', label: 'Housing', icon: Home, legacy: 'https://claude.ai/code/artifact/8b906a24-09b3-48c3-b616-eff0d23b8906' },
  { path: '/events', label: 'Events', icon: CalendarDays, legacy: 'https://claude.ai/code/artifact/0b17e4d1-5ad4-439f-b8fe-d52ab783e7ac' },
]

export const settingsSection = { path: '/settings', label: 'Settings', icon: Settings }
