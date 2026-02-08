import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Workspace, CreateWorkspaceRequest, UpdateWorkspaceRequest } from '@/types/workspace';
import { useToast } from '@/hooks/use-toast';
import { listWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace } from '@/api/workspace';

interface WorkspaceContextType {
  // Workspace Management
  selectedWorkspace: string; // "home" | workspace.name
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  
  // Actions
  selectWorkspace: (workspaceName: string) => void;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (data: CreateWorkspaceRequest) => Promise<void>;
  updateWorkspace: (name: string, data: UpdateWorkspaceRequest) => Promise<void>;
  deleteWorkspace: (name: string) => Promise<void>;
  
  // Helper to get current workspace data
  getCurrentWorkspace: () => Workspace | null;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
}

// Storage key structure
const WORKSPACE_STORAGE_KEYS = {
  SELECTED_WORKSPACE: 'selected-workspace',
  WORKSPACE_CACHE: 'workspace-cache',
};

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const { toast } = useToast();
  
  // Workspace state
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(() => {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEYS.SELECTED_WORKSPACE);
    return stored || 'home';
  });
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEYS.WORKSPACE_CACHE);
    return stored ? JSON.parse(stored) : [];
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch workspaces from API
  const refreshWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const workspaces = await listWorkspaces();
      setWorkspaces(workspaces);
      
      // Cache workspaces
      localStorage.setItem(WORKSPACE_STORAGE_KEYS.WORKSPACE_CACHE, JSON.stringify(workspaces));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch workspaces';
      setError(errorMessage);
      console.error('Error fetching workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Select workspace
  const selectWorkspace = useCallback((workspaceName: string) => {
    setSelectedWorkspace(workspaceName);
    localStorage.setItem(WORKSPACE_STORAGE_KEYS.SELECTED_WORKSPACE, workspaceName);
  }, []);
  
  // Get current workspace data
  const getCurrentWorkspace = useCallback(() => {
    if (selectedWorkspace === 'home') return null;
    return workspaces.find(w => w.name === selectedWorkspace) || null;
  }, [selectedWorkspace, workspaces]);
  
  // Create workspace
  const handleCreateWorkspace = useCallback(async (data: CreateWorkspaceRequest) => {
    try {
      setLoading(true);
      await createWorkspace(data);
      await refreshWorkspaces();
      
      toast({
        title: "Success",
        description: `Workspace "${data.name}" created successfully`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create workspace';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshWorkspaces, toast]);
  
  // Update workspace
  const handleUpdateWorkspace = useCallback(async (name: string, data: UpdateWorkspaceRequest) => {
    try {
      setLoading(true);
      await updateWorkspace(name, data);
      await refreshWorkspaces();
      
      toast({
        title: "Success",
        description: `Workspace "${name}" updated successfully`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update workspace';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshWorkspaces, toast]);
  
  // Delete workspace
  const handleDeleteWorkspace = useCallback(async (name: string) => {
    try {
      setLoading(true);
      await deleteWorkspace(name);
      
      // If deleting the currently selected workspace, switch to home
      if (selectedWorkspace === name) {
        selectWorkspace('home');
      }
      
      await refreshWorkspaces();
      
      toast({
        title: "Success",
        description: `Workspace "${name}" deleted successfully`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete workspace';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace, selectWorkspace, refreshWorkspaces, toast]);
  
  // Initial workspace fetch
  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);
  
  const value = {
    // Workspace Management
    selectedWorkspace,
    workspaces,
    loading,
    error,
    
    // Actions
    selectWorkspace,
    refreshWorkspaces,
    createWorkspace: handleCreateWorkspace,
    updateWorkspace: handleUpdateWorkspace,
    deleteWorkspace: handleDeleteWorkspace,
    
    // Helper
    getCurrentWorkspace,
  };
  
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};