"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateWorkspaceDialog } from "@/components/workspace/createworkspacedialog.component"

interface ClusterContext {
  name: string
  context: string
  server: string
}

interface Workspace {
  id: string
  name: string
  clusters: ClusterContext[]
  isActive: boolean
}

const dummyWorkspaces: Workspace[] = [
  {
    id: "1",
    name: "Home",
    clusters: [
      { name: "docker-desktop", context: "docker-desktop", server: "https://127.0.0.1:6443" },
      { name: "kind-local", context: "kind-local", server: "https://127.0.0.1:52701" }
    ],
    isActive: true,
  },
  {
    id: "2",
    name: "production",
    clusters: [
      { name: "exciting-classical-badger", context: "eks-cluster", server: "https://4D4BFC24E115E478674CA878D291C58C.gr7.us-east-1.eks.amazonaws.com" },
      { name: "interesting-lofi-otter", context: "eks-cluster-2", server: "https://51F838D95BE58C88CF8B657B99131F99.gr7.us-east-1.eks.amazonaws.com" }
    ],
    isActive: false,
  },
  {
    id: "3",
    name: "testing-space",
    clusters: [
      { name: "kind-genspark-dino", context: "kind-genspark-dino", server: "https://127.0.0.1:52701" }
    ],
    isActive: false,
  },
  {
    id: "4",
    name: "agentkube-demo",
    clusters: [
      { name: "kind-test-cluster", context: "kind-test-cluster", server: "https://127.0.0.1:51651" },
      { name: "kind-sub-zero", context: "kind-sub-zero", server: "https://127.0.0.1:58645" }
    ],
    isActive: false,
  },
]

// Generate color class based on workspace name using predefined colors
const generateColorFromName = (name: string): string => {
  const colors = [
    'bg-orange-500/50',
    'bg-blue-500/50', 
    'bg-green-500/50',
    'bg-purple-500/50'
  ]
  
  // Create hash from first two characters
  const chars = name.substring(0, 2).toUpperCase()
  let hash = 0
  for (let i = 0; i < chars.length; i++) {
    hash = chars.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Use modulo to select from predefined colors
  const colorIndex = Math.abs(hash) % colors.length
  return colors[colorIndex]
}

export function WorkspaceSwitcher() {
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    dummyWorkspaces.find(w => w.isActive)?.id || dummyWorkspaces[0].id
  )
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  const currentWorkspace = dummyWorkspaces.find(w => w.id === selectedWorkspace)

  const handleWorkspaceChange = (workspaceId: string) => {
    if (workspaceId === 'create-workspace') {
      setIsCreateDialogOpen(true)
      return
    }
    setSelectedWorkspace(workspaceId)
    console.log('Switching to workspace:', dummyWorkspaces.find(w => w.id === workspaceId)?.name)
  }

  const handleCreateWorkspace = (workspace: { name: string; description: string }) => {
    console.log('Creating workspace:', workspace)
    // TODO: Add API call to create workspace
    // For now, just log the workspace data
  }

  return (
    <>
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
              <div className={`w-5 h-5 rounded-sm flex items-center justify-center text-gray-300/80 text-xs font-bold ${generateColorFromName(workspace.name)}`}>
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {workspace.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-44">
                  {workspace.clusters.length} {workspace.clusters.length === 1 ? 'cluster' : 'clusters'} - {workspace.clusters.map(c => c.name).join(', ')}
                </div>
              </div>
            </div>
          </SelectItem>
        ))}
        <div className="border-t border-gray-200 dark:border-gray-700/40" />
        <SelectItem value="create-workspace" className="cursor-pointer">
          <div className="flex items-center space-x-3 w-full">
            <Plus className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Create Workspace
            </span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
    
    <CreateWorkspaceDialog
      open={isCreateDialogOpen}
      onOpenChange={setIsCreateDialogOpen}
      onCreateWorkspace={handleCreateWorkspace}
    />
    </>
  )
}