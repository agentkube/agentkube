"use client"

import { useState, useEffect } from "react"
import { Plus, Settings } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateWorkspaceDialog } from "@/components/workspace/createworkspacedialog.component"
import { ManageWorkspacesDialog } from "@/components/workspace/manageworkspacesdialog.component"
import { useWorkspace } from "@/contexts/workspaceContext"
import { useCluster } from "@/contexts/clusterContext"
import type { ClusterInfo } from "@/types/workspace"

const homeView = {
  name: "Home",
}

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
  const { selectedWorkspace, workspaces, selectWorkspace, createWorkspace } = useWorkspace()
  const { allContexts } = useCluster()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)

  // Fallback to "home" if selectedWorkspace is empty or invalid
  const safeSelectedWorkspace = selectedWorkspace || "home"

  // If the selected workspace doesn't exist in the workspaces list (and it's not "home"), fallback to "home"
  const validSelectedWorkspace = safeSelectedWorkspace === "home" || workspaces.find(w => w.name === safeSelectedWorkspace)
    ? safeSelectedWorkspace
    : "home"

  const currentWorkspace = validSelectedWorkspace === "home"
    ? homeView
    : workspaces.find(w => w.name === validSelectedWorkspace)

  // Auto-correct invalid workspace selection
  useEffect(() => {
    if (validSelectedWorkspace !== selectedWorkspace) {
      console.log(`Workspace "${selectedWorkspace}" not found, switching to "home"`)
      selectWorkspace("home")
    }
  }, [validSelectedWorkspace, selectedWorkspace, selectWorkspace])

  const handleWorkspaceChange = (workspaceId: string) => {
    if (workspaceId === 'create-workspace') {
      setIsCreateDialogOpen(true)
      return
    }
    if (workspaceId === 'manage-workspaces') {
      setIsManageDialogOpen(true)
      return
    }
    selectWorkspace(workspaceId)
    if (workspaceId === 'home') {
      console.log('Switching to Home - showing all clusters')
    } else {
      console.log('Switching to workspace:', workspaces.find(w => w.name === workspaceId)?.name)
    }
  }

  const handleCreateWorkspace = async (workspace: { name: string; description: string; clusters: ClusterInfo[] }) => {
    try {
      await createWorkspace({
        name: workspace.name,
        description: workspace.description,
        clusters: workspace.clusters
      })
    } catch (error) {
      console.error('Failed to create workspace:', error)
    }
  }

  return (
    <>
      <Select value={validSelectedWorkspace} onValueChange={handleWorkspaceChange}>
        <SelectTrigger className="w-40 h-7 p-1.5 text-xs border-none border-border bg-transparent hover:bg-accent-hover  focus:ring-0 focus:ring-offset-0">
          <div className="flex items-center space-x-2 ">
            {/* <div className="w-5 h-5 rounded-sm bg-gray-500/40 flex items-center justify-center text-white/50 text-xs font-bold">
            {currentWorkspace?.name.charAt(0).toUpperCase()}
          </div> */}
            <SelectValue>
              <span className="text-foreground font-medium">
                {currentWorkspace?.name}
              </span>
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent className="w-64 bg-card backdrop-blur-md border-border">
          <SelectItem
            value="home"
            className="cursor-pointer hover:bg-accent-hover"
          >
            <div className="flex items-center space-x-3 w-full">
              <div className="w-5 h-5 rounded-sm flex items-center justify-center text-gray-300/80 text-xs font-bold bg-gray-500/50">
                H
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  Home
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-44">
                  All clusters - {allContexts.length} clusters
                </div>
              </div>
            </div>
          </SelectItem>
          <div className="border-t border-border" />
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Workspaces
          </div>
          {workspaces.map((workspace) => (
            <SelectItem
              key={workspace.name}
              value={workspace.name}
              className="cursor-pointer hover:bg-accent-hover"
            >
              <div className="flex items-center space-x-3 w-full">
                <div className={`w-5 h-5 rounded-sm flex items-center justify-center text-gray-300/80 text-xs font-bold ${generateColorFromName(workspace.name)}`}>
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {workspace.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-44">
                    {workspace.clusters?.length || 0} {(workspace.clusters?.length || 0) === 1 ? 'cluster' : 'clusters'} - {workspace.clusters?.map(c => c.name).join(', ') || 'No clusters'}
                  </div>
                </div>
              </div>
            </SelectItem>
          ))}
          <div className="border-t border-border" />
          <SelectItem value="create-workspace" className="cursor-pointer">
            <div className="flex items-center space-x-3 w-full">
              <Plus className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-foreground">
                Create Workspace
              </span>
            </div>
          </SelectItem>
          <SelectItem value="manage-workspaces" className="cursor-pointer">
            <div className="flex items-center space-x-3 w-full">
              <Settings className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-foreground">
                Manage Workspaces
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

      <ManageWorkspacesDialog
        open={isManageDialogOpen}
        onOpenChange={setIsManageDialogOpen}
      />
    </>
  )
}