import React from 'react';
import { 
  SiPuppeteer, 
  SiPostgresql, 
  SiGithub, 
  SiFigma, 
  SiSlack, 
  SiGitlab, 
  SiGooglemaps, 
  SiGoogledrive,
  SiSqlite,
  SiRedis,
  SiBrave,
  SiLinear,
  SiClaude,
  SiJenkins
} from '@icons-pack/react-simple-icons';
import { Clock, Database, Search, FileText, Zap } from 'lucide-react';
import { AWS_PROVIDER } from '@/assets/providers';
import { DeepWiki } from '@/assets/icons';

export interface MCPIconMapEntry {
  icon: React.ReactElement;
  iconBg: string;
}

export const MCPIconMap: Record<string, MCPIconMapEntry> = {
  'filesystem': {
    icon: <FileText className='h-4 w-4' />,
    iconBg: 'bg-blue-500'
  },
  'git': {
    icon: <SiGithub className='h-4 w-4' />,
    iconBg: 'bg-neutral-400'
  },
  'sqlite': {
    icon: <SiSqlite className='h-4 w-4' />,
    iconBg: 'bg-blue-600'
  },
  'brave-search': {
    icon: <SiBrave className='h-4 w-4' />,
    iconBg: 'bg-orange-500'
  },
  'postgres': {
    icon: <SiPostgresql className='h-4 w-4' />,
    iconBg: 'bg-emerald-500'
  },
  'github': {
    icon: <SiGithub className='h-4 w-4' />,
    iconBg: 'bg-neutral-400'
  },
  'puppeteer': {
    icon: <SiPuppeteer className='h-4 w-4' />,
    iconBg: 'bg-blue-500'
  },
  'slack': {
    icon: <SiSlack className='h-4 w-4' />,
    iconBg: 'bg-emerald-500'
  },
  'redis': {
    icon: <SiRedis className='h-4 w-4' />,
    iconBg: 'bg-red-500'
  },
  'gitlab': {
    icon: <SiGitlab className='h-4 w-4' />,
    iconBg: 'bg-orange-600'
  },
  'sentry': {
    icon: <Zap className='h-4 w-4' />,
    iconBg: 'bg-purple-500'
  },
  'gdrive': {
    icon: <SiGoogledrive className='h-4 w-4' />,
    iconBg: 'bg-red-400'
  },
  'aws-kb-retrieval': {
    icon: <img src={AWS_PROVIDER} className='h-4' />,
    iconBg: 'bg-neutral-200'
  },
  // Legacy mappings for existing hardcoded tools
  'figma': {
    icon: <SiFigma className='h-4 w-4' />,
    iconBg: 'bg-emerald-600'
  },
  'time': {
    icon: <Clock className='h-4 w-4' />,
    iconBg: 'bg-cyan-500'
  },
  'googlemaps': {
    icon: <SiGooglemaps className='h-4 w-4' />,
    iconBg: 'bg-purple-500'
  },
  'aws': {
    icon: <img src={AWS_PROVIDER} className='h-4' />,
    iconBg: 'bg-neutral-200'
  },
  'googledrive': {
    icon: <SiGoogledrive className='h-4 w-4' />,
    iconBg: 'bg-red-400'
  },
  'postgresql': {
    icon: <SiPostgresql className='h-4 w-4' />,
    iconBg: 'bg-emerald-500'
  },
  'deepwiki': {
    icon: <DeepWiki className='h-4 w-4' />,
    iconBg: 'bg-black'
  },
  'linear': {
    icon: <SiLinear className='h-4 w-4' />,
    iconBg: 'bg-[#5E6AD2]'
  },
  'jenkins': {
    icon: <SiJenkins className='h-4 w-4' />,
    iconBg: 'bg-yellow-500'
  },
};

export const getMCPIcon = (slug: string): MCPIconMapEntry => {
  return MCPIconMap[slug] || {
    icon: <SiClaude className='h-4 w-4' />,
    iconBg: 'bg-[#D97757]'
  };
};