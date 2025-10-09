"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Tags,
  TagsContent,
  TagsEmpty,
  TagsGroup,
  TagsInput,
  TagsItem,
  TagsList,
  TagsTrigger,
  TagsValue,
} from "@/components/ui/tags"
import { Trash2, Edit, AlertTriangle, Server, CheckIcon } from "lucide-react"
import type { Workspace, ClusterInfo } from "@/types/workspace"
import { useCluster } from "@/contexts/clusterContext"
import { useWorkspace } from "@/contexts/workspaceContext"

interface ManageWorkspacesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageWorkspacesDialog({
  open,
  onOpenChange,
}: ManageWorkspacesDialogProps) {
  const { workspaces, updateWorkspace, deleteWorkspace, refreshWorkspaces, loading } = useWorkspace()
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("")
  const [selectedWorkspaceData, setSelectedWorkspaceData] = useState<Workspace | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [editedDescription, setEditedDescription] = useState("")
  const [editedClusters, setEditedClusters] = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Get available clusters
  const { allContexts } = useCluster()

  // Load workspaces when dialog opens
  useEffect(() => {
    if (open) {
      refreshWorkspaces()
    }
  }, [open, refreshWorkspaces])

  // Update selected workspace data when selection changes
  useEffect(() => {
    if (selectedWorkspace && workspaces.length > 0) {
      const workspace = workspaces.find(w => w.name === selectedWorkspace)
      setSelectedWorkspaceData(workspace || null)
      if (workspace) {
        setEditedName(workspace.name)
        setEditedDescription(workspace.description || "")
        setEditedClusters(workspace.clusters?.map(c => c.name) || [])
      }
    } else {
      setSelectedWorkspaceData(null)
    }
  }, [selectedWorkspace, workspaces])

  const handleWorkspaceSelect = (workspaceName: string) => {
    setSelectedWorkspace(workspaceName)
    setIsEditing(false)
    setShowDeleteConfirm(false)
  }

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to original values
      if (selectedWorkspaceData) {
        setEditedName(selectedWorkspaceData.name)
        setEditedDescription(selectedWorkspaceData.description || "")
        setEditedClusters(selectedWorkspaceData.clusters?.map(c => c.name) || [])
      }
    }
    setIsEditing(!isEditing)
  }

  // Handle cluster selection
  const handleClusterRemove = (clusterId: string) => {
    setEditedClusters(prev => prev.filter(id => id !== clusterId))
  }

  const handleClusterSelect = (clusterId: string) => {
    if (editedClusters.includes(clusterId)) {
      handleClusterRemove(clusterId)
      return
    }
    setEditedClusters(prev => [...prev, clusterId])
  }

  const handleUpdate = async () => {
    if (!selectedWorkspaceData || !editedName.trim()) return

    setIsUpdating(true)
    try {
      // Convert selected cluster IDs to ClusterInfo objects
      const clusters: ClusterInfo[] = editedClusters
        .map(clusterId => {
          const context = allContexts.find(ctx => ctx.name === clusterId)
          if (!context) return null
          return {
            name: context.name,
            context: context.name,
            server: context.server
          }
        })
        .filter((cluster): cluster is ClusterInfo => cluster !== null)

      await updateWorkspace(selectedWorkspaceData.name, {
        name: editedName.trim(),
        description: editedDescription.trim(),
        clusters
      })
      
      // Update selected workspace if name changed
      if (editedName !== selectedWorkspaceData.name) {
        setSelectedWorkspace(editedName)
      }
      
      setIsEditing(false)
    } catch (error) {
      console.error("Failed to update workspace:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedWorkspaceData) return

    setIsDeleting(true)
    try {
      await deleteWorkspace(selectedWorkspaceData.name)
      
      // Clear selection
      setSelectedWorkspace("")
      setSelectedWorkspaceData(null)
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error("Failed to delete workspace:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    setSelectedWorkspace("")
    setSelectedWorkspaceData(null)
    setIsEditing(false)
    setShowDeleteConfirm(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark:bg-[#0B0D13]/40 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Manage Workspaces</DialogTitle>
          <DialogDescription>
            Select a workspace to view, edit, or delete it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Workspace Selection */}
          <div className="space-y-2">
            <Label htmlFor="workspace-select" className="text-sm font-medium">
              Select Workspace
            </Label>
            <Select value={selectedWorkspace} onValueChange={handleWorkspaceSelect}>
              <SelectTrigger className="w-full py-4">
                <SelectValue placeholder={loading ? "Loading workspaces..." : "Choose a workspace to manage"} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.name} value={workspace.name}>
                    <div className="flex items-center space-x-2">
                      <span>{workspace.name}</span>
                      <Badge className="text-xs">
                        {workspace.clusters?.length || 0} clusters
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Workspace Details */}
          {selectedWorkspaceData && (
            <div className="space-y-4 rounded-lg p-2 border-none">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Workspace Details</h3>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    onClick={handleEditToggle}
                    disabled={isUpdating}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    {/* {isEditing ? "Cancel" : "Edit"} */}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-400 dark:text-red-500"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting || isUpdating}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="workspace-name" className="text-xs font-medium">
                  Workspace Name
                </Label>
                {isEditing ? (
                  <Input
                    id="workspace-name"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Workspace name"
                    disabled={isUpdating}
                  />
                ) : (
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-sm">
                    {selectedWorkspaceData.name}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="workspace-description" className="text-xs font-medium">
                  Description
                </Label>
                {isEditing ? (
                  <Textarea
                    id="workspace-description"
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={3}
                    disabled={isUpdating}
                  />
                ) : (
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-sm min-h-[60px]">
                    {selectedWorkspaceData.description || "No description provided"}
                  </div>
                )}
              </div>

              {/* Clusters */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Clusters ({isEditing ? editedClusters.length : selectedWorkspaceData.clusters?.length || 0})
                </Label>
                {isEditing ? (
                  <Tags className="w-full">
                    <TagsTrigger className="min-h-[40px]">
                      {editedClusters.map((clusterId) => {
                        const context = allContexts.find(ctx => ctx.name === clusterId)
                        return (
                          <TagsValue
                            key={clusterId}
                            className="p-2 dark:bg-gray-700/30"
                            onRemove={() => handleClusterRemove(clusterId)}
                          >
                            {context?.name || clusterId}
                          </TagsValue>
                        )
                      })}
                    </TagsTrigger>
                    <TagsContent className="">
                      <TagsInput placeholder="Search clusters..." />
                      <TagsList className="dark:bg-[#0B0D13]/30 backdrop-blur-md">
                        <TagsEmpty>No clusters found.</TagsEmpty>
                        <TagsGroup className="">
                          {allContexts.map((context) => (
                            <TagsItem
                              key={context.name}
                              value={context.name}
                              onSelect={handleClusterSelect}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{context.name}</span>
                                {editedClusters.includes(context.name) && (
                                  <CheckIcon className="text-muted-foreground" size={14} />
                                )}
                              </div>
                            </TagsItem>
                          ))}
                        </TagsGroup>
                      </TagsList>
                    </TagsContent>
                  </Tags>
                ) : (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {selectedWorkspaceData.clusters && selectedWorkspaceData.clusters.length > 0 ? (
                      selectedWorkspaceData.clusters.map((cluster, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-sm"
                        >
                          <Server className="h-4 w-4 text-gray-500" />
                          <div className="flex-1">
                            <div className="font-medium">{cluster.name}</div>
                            <div className="text-xs max-w-56 text-gray-500 truncate">
                              {cluster.server}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500 italic">No clusters assigned</div>
                    )}
                  </div>
                )}
              </div>

              {/* Update Button */}
              {isEditing && (
                <Button
                  onClick={handleUpdate}
                  disabled={!editedName.trim() || isUpdating}
                  className="w-full"
                >
                  {isUpdating ? "Updating..." : "Update Workspace"}
                </Button>
              )}
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && selectedWorkspaceData && (
            <div className="border border-red-200 dark:border-red-800/40 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-800 dark:text-red-400">
                    Confirm Deletion
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Are you sure you want to delete the workspace "{selectedWorkspaceData.name}"? 
                    This action cannot be undone.
                  </p>
                  <div className="flex space-x-2 mt-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Yes, Delete"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}