"use client"

import { useState } from "react"
import { Check, FolderOpen, Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Workspace {
  id: string
  name: string
  path: string
  isActive: boolean
}

const dummyWorkspaces: Workspace[] = [
  {
    id: "1",
    name: "workspace-demo",
    path: "../projects/orchestrator",
    isActive: true,
  },
  {
    id: "2",
    name: "agentkube-workspace",
    path: "../agentkube-tauri-platform",
    isActive: false,
  },
  {
    id: "3",
    name: "agentkube-space",
    path: "../projects/agentkube-core",
    isActive: false,
  },
  {
    id: "4",
    name: "agentkube-demo",
    path: "../projects/marketplace",
    isActive: false,
  },
]

export function WorkspaceSwitcher() {
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    dummyWorkspaces.find(w => w.isActive)?.id || dummyWorkspaces[0].id
  )

  const currentWorkspace = dummyWorkspaces.find(w => w.id === selectedWorkspace)

  const handleWorkspaceChange = (workspaceId: string) => {
    setSelectedWorkspace(workspaceId)
    console.log('Switching to workspace:', dummyWorkspaces.find(w => w.id === workspaceId)?.name)
  }

  return (
    <Select value={selectedWorkspace} onValueChange={handleWorkspaceChange}>
      <SelectTrigger className="w-40 h-7 p-1.5 text-xs border-none border-gray-300 dark:border-gray-500/10 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50  focus:ring-0 focus:ring-offset-0">
        <div className="flex items-center space-x-2 ">
          {/* <div className="w-5 h-5 rounded-sm bg-gray-500/40 flex items-center justify-center text-white/50 text-xs font-bold">
            {currentWorkspace?.name.charAt(0).toUpperCase()}
          </div> */}
          <SelectValue>
            <span className="text-gray-700 dark:text-gray-300/50 font-medium">
              {currentWorkspace?.name}
            </span>
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="w-64 dark:bg-[#0B0D13]/40 backdrop-blur-md dark:border-gray-600/20">
        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Workspaces
        </div>
        {dummyWorkspaces.map((workspace) => (
          <SelectItem
            key={workspace.id}
            value={workspace.id}
            className="cursor-pointer  dark:hover:bg-gray-500/30"
          >
            <div className="flex items-center space-x-3 w-full">
              <div className={`w-5 h-5 rounded-sm flex items-center justify-center text-gray-300/80 text-xs font-bold ${
                workspace.name === 'workspace-demo' ? 'bg-orange-500/50' :
                workspace.name === 'agentkube-workspace' ? 'bg-blue-500/50' :
                workspace.name === 'agentkube-space' ? 'bg-green-500/50' :
                'bg-purple-500/50'
              }`}>
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {workspace.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {workspace.path}
                </div>
              </div>
            </div>
          </SelectItem>
        ))}
        <div className="border-t border-gray-200 dark:border-gray-700/40" />
        <SelectItem value="open-folder" className="cursor-pointer">
          <div className="flex items-center space-x-3 w-full">
            <Plus className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Create Workspace
            </span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}