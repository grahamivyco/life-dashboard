import {
  Sun, Mail, History, Wallet, Briefcase, Users, Home, CalendarDays, Settings,
} from 'lucide-react'

export const sections = [
  { path: '/', label: 'Today', icon: Sun, badge: 'claude' },
  { path: '/email', label: 'Email', icon: Mail, badge: 'email', dot: true },
  { path: '/timeline', label: 'Timeline', icon: History },
  { path: '/finances', label: 'Finances', icon: Wallet },
  { path: '/jobs', label: 'Jobs', icon: Briefcase },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/housing', label: 'Housing', icon: Home },
  { path: '/events', label: 'Events', icon: CalendarDays },
]

export const settingsSection = { path: '/settings', label: 'Settings', icon: Settings }
