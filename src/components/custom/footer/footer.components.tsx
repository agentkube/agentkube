import { Terminal } from 'lucide-react';
import React from 'react'
import TerminalContainer from '../terminal/terminalcontainer.component';
import { openExternalUrl } from '@/api/external';
const Footer = () => {
  return (
    <footer className="flex-none text-xs border-t border-gray-100/10 pr-2">
      <div className="flex justify-between items-center">
        <div>
          <TerminalContainer />
        </div>
        <div className='flex space-x-2'>
          <div className=" text-gray-600">
            v0.1.0
          </div>
          <a
            onClick={() => openExternalUrl("https://github.com/agentkube/dashboard/releases")}  
            className="text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Changelog
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer