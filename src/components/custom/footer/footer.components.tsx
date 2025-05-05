import { Rss, Terminal } from 'lucide-react';
import React from 'react'
import TerminalContainer from '../terminal/terminalcontainer.component';
import { openExternalUrl } from '@/api/external';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

const Footer = () => {
  return (
    <footer className="mt-4 flex-none text-xs border-t border-gray-100/10 pr-2">
      <div className="flex justify-between items-center">
        <div>
          <TerminalContainer />
        </div>
        <div className='flex'>
          <div className="text-gray-600 px-2 py-0.5">
            v1.0.0
          </div>
          <a
            onClick={() => openExternalUrl("https://docs.agentkube.com/changelog")}
            className="text-blue-600 hover:text-blue-500 cursor-pointer group px-2 hover:bg-gray-100/10"
          >
            changelog
          </a>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-gray-500 py-1 px-2 group hover:bg-gray-100/10 hover:text-gray-300 transition-all cursor-pointer">
                  <Rss className='h-3 w-3 group' />
                </div>
              </TooltipTrigger>
              <TooltipContent className='bg-white dark:bg-[#131112] text-gray-900 dark:text-gray-100 space-y-2'>
                <button className='rounded-[0.3rem] py-1 px-3 bg-gray-200 dark:bg-gray-400/10 hover:dark:bg-gray-300/10 transition-all'>
                  Check for updates.
                </button>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </footer>
  )
}

export default Footer