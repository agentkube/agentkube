import React from "react";
import { Moon, Settings, Keyboard, File, Monitor, Server, CodeXml } from "lucide-react";

export const SYSTEM_SUGGESTIONS = [
  {
    title: 'Editor',
    description: 'Edit Resources',
    icon: <CodeXml className="w-5 h-5" />,
    link: '/dashboard/editor'
  },
  {
    title: 'Switch Context',
    description: 'Switch Context',
    icon: <Settings className="w-5 h-5" />,
    link: '/'
  },
  {
    title: 'Overview',
    description: 'ClusterOverview',
    icon: <Monitor className="w-5 h-5" />,
    link: '/'
  },
  {
    title: 'Configure Settings',
    description: 'Modify general configuration',
    icon: <Settings className="w-5 h-5" />,
    link: '/settings/general'
  },
  {
    title: 'Change Theme',
    description: 'Toggle Theme',
    icon: <Moon className="w-5 h-5" />,
    link: '/settings/appearance'
  },
  {
    title: 'Change Shortcuts',
    description: 'Change Shortcuts',
    icon: <Keyboard className="w-5 h-5" />,
    link: '/settings/shortcuts'
  },
  {
    title: 'Change Kubeconfig',
    description: 'Change Kubeconfig',
    icon: <File className="w-5 h-5" />,
    link: '/settings/kubeconfig'
  },
  {
    title: 'View Investigation',
    description: 'View Investigation',
    icon: <File className="w-5 h-5" />,
    link: '/dashboard/investigate'
  },
  {
    title: 'View Runbooks',
    description: 'View Runbooks',
    icon: <File className="w-5 h-5" />,
    link: '/dashboard/runbooks'
  },
  {
    title: 'View Cost Management',
    description: 'View Cost Management',
    icon: <File className="w-5 h-5" />,
    link: '/dashboard/cost-management'
  },
  {
    title: 'View Security Audit Report',
    description: 'View Security Audit Report',
    icon: <File className="w-5 h-5" />,
    link: '/dashboard/security-best-practices'
  },
  {
    title: 'View Vulnerability Report',
    description: 'View Vulnerability Report',
    icon: <File className="w-5 h-5" />,
    link: '/dashboard/vulnerability-report'
  },
  {
    title: 'MCP Server',
    description: 'Configure MCP Server',
    icon: <Server className="w-5 h-5" />,
    link: '/settings/mcp'
  },
]
