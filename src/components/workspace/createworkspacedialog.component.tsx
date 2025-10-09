"use client"

import { useState } from "react"
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
import { CheckIcon } from "lucide-react"
import { useCluster } from "@/contexts/clusterContext"
import type { ClusterInfo } from "@/types/workspace"

interface CreateWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateWorkspace: (workspace: { name: string; description: string; clusters: ClusterInfo[] }) => void
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreateWorkspace,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedClusters, setSelectedClusters] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

  // Get available clusters
  const { allContexts } = useCluster()

  // Handle cluster selection
  const handleClusterRemove = (clusterId: string) => {
    setSelectedClusters(prev => prev.filter(id => id !== clusterId))
  }

  const handleClusterSelect = (clusterId: string) => {
    if (selectedClusters.includes(clusterId)) {
      handleClusterRemove(clusterId)
      return
    }
    setSelectedClusters(prev => [...prev, clusterId])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsCreating(true)
    try {
      // Convert selected cluster IDs to ClusterInfo objects
      const clusters: ClusterInfo[] = selectedClusters
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

      await onCreateWorkspace({
        name: name.trim(),
        description: description.trim(),
        clusters
      })

      // Reset form and close dialog
      setName("")
      setDescription("")
      setSelectedClusters([])
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create workspace:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    setName("")
    setDescription("")
    setSelectedClusters([])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] dark:bg-[#0B0D13]/40 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Create a new workspace to organize your Kubernetes clusters and contexts.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className=" items-center gap-4">

              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production-clusters"
                className="col-span-3"
                required
                disabled={isCreating}
              />
            </div>

            <div className=" items-center gap-4">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this workspace..."
                className="col-span-3 resize-none"
                rows={3}
                disabled={isCreating}
              />
            </div>

            <div className="items-center gap-4">
              <Label htmlFor="clusters" className="text-sm font-medium mb-2 block">
                Select Clusters
              </Label>
              <Tags className="w-full">
                <TagsTrigger className="min-h-[40px]">
                  {selectedClusters.map((clusterId) => {
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
                            {selectedClusters.includes(context.name) && (
                              <CheckIcon className="text-muted-foreground" size={14} />
                            )}
                          </div>
                        </TagsItem>
                      ))}
                    </TagsGroup>
                  </TagsList>
                </TagsContent>
              </Tags>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create Workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}