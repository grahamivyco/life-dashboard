import {
  Sun, Mail, History, Wallet, Briefcase, Users, Home, CalendarDays, Settings,
} from 'lucide-react'

// `legacy` = existing dashboard, linked until that section moves into the app
export const sections = [
  { path: '/', label: 'Today', icon: Sun, badge: 'claude' },
  { path: '/email', label: 'Email', icon: Mail, badge: 'email' },
  { path: '/timeline', label: 'Timeline', icon: History },
  { path: '/finances', label: 'Finances', icon: Wallet },
  { path: '/jobs', label: 'Jobs', icon: Briefcase, legacy: 'https://claude.ai/code/artifact/94c1d4fb-5a22-4cb3-8c2d-bde80507dbd2' },
  { path: '/clients', label: 'Clients', icon: Users, legacy: 'https://claude.ai/code/artifact/84558951-84a9-4d63-b9d7-6720723b01a2' },
  { path: '/housing', label: 'Housing', icon: Home, legacy: 'https://claude.ai/code/artifact/8b906a24-09b3-48c3-b616-eff0d23b8906' },
  { path: '/events', label: 'Events', icon: CalendarDays },
]

export const settingsSection = { path: '/settings', label: 'Settings', icon: Settings }
