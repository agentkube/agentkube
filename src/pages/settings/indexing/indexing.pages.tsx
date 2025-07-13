import React, { useState, useEffect, useRef } from 'react';
import { 
  Info, 
  RefreshCw, 
  Trash2, 
  Plus, 
  Edit3, 
  RotateCcw, 
  Copy, 
  ExternalLink,
  FileText,
  Globe,
  BookOpen,
  X,
  Search,
  Link
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SwitchToggleProps {
  enabled: boolean;
  onChange: () => void;
}

interface ProgressBarProps {
  percentage: number;
  fileCount: number;
  isAnimating?: boolean;
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface DocItemProps {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onEdit: () => void;
  onRefresh: () => void;
  onIndex: () => void;
  onDelete: () => void;
}

interface DocItem {
  id: string;
  title: string;
  url: string;
  type: 'file' | 'web';
  lastIndexed: string;
}

const Indexing: React.FC = () => {
  const [indexNewFolders, setIndexNewFolders] = useState<boolean>(true);
  const [includePRsInSearch, setIncludePRsInSearch] = useState<boolean>(true);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newDocUrl, setNewDocUrl] = useState<string>('');
  const [newDocTitle, setNewDocTitle] = useState<string>('');
  const [editingDocId, setEditingDocId] = useState<string | null>(null); // Track which doc is being edited
  const [isSync, setIsSync] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(100);
  const [syncFileCount, setSyncFileCount] = useState<number>(468);
  const [docs, setDocs] = useState<DocItem[]>([
    {
      id: '1',
      title: 'Tauri HTTP plugin',
      url: 'https://tauri.app/v1/api/js/http',
      type: 'web',
      lastIndexed: 'Indexed 25/02/25, 1:51 pm'
    },
    {
      id: '2',
      title: 'Tauri Websockets',
      url: 'https://tauri.app/v1/api/js/websocket',
      type: 'web',
      lastIndexed: 'Indexed 25/02/25, 1:52 am'
    }
  ]);

  // Add refs for the modal inputs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const toggleSwitch = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter((prev: boolean) => !prev);
  };

  const handleSync = () => {
    setIsSync(true);
    setSyncProgress(0);
    setSyncFileCount(0);
    
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsSync(false);
          setSyncFileCount(468);
          return 100;
        }
        const newProgress = prev + Math.random() * 15;
        setSyncFileCount(Math.floor((newProgress / 100) * 468));
        return Math.min(newProgress, 100);
      });
    }, 200);
  };

  const handleDeleteIndex = () => {
    setSyncProgress(0);
    setSyncFileCount(0);
    // Reset after a moment to show it's been cleared
    setTimeout(() => {
      setSyncProgress(100);
      setSyncFileCount(468);
    }, 1000);
  };

  const handleAddDoc = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (newDocTitle.trim() && newDocUrl.trim()) {
      if (editingDocId) {
        // Update existing doc
        const updatedDoc: DocItem = {
          id: editingDocId,
          title: newDocTitle.trim(),
          url: newDocUrl.trim(),
          type: newDocUrl.startsWith('http') ? 'web' : 'file',
          lastIndexed: `Indexed ${new Date().toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit' 
          })}, ${new Date().toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          })}`
        };
        
        setDocs(prev => prev.map(doc => doc.id === editingDocId ? updatedDoc : doc));
        setEditingDocId(null);
      } else {
        // Add new doc
        const newDoc: DocItem = {
          id: Date.now().toString(),
          title: newDocTitle.trim(),
          url: newDocUrl.trim(),
          type: newDocUrl.startsWith('http') ? 'web' : 'file',
          lastIndexed: `Indexed ${new Date().toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit' 
          })}, ${new Date().toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          })}`
        };
        
        setDocs(prev => [...prev, newDoc]);
      }
      
      setNewDocTitle('');
      setNewDocUrl('');
      setIsSpotlightOpen(false);
    }
  };

  const handleDeleteDoc = (id: string) => {
    setDocs(prev => prev.filter(doc => doc.id !== id));
  };

  const handleEditDoc = (id: string) => {
    const doc = docs.find(d => d.id === id);
    if (doc) {
      setNewDocTitle(doc.title);
      setNewDocUrl(doc.url);
      setEditingDocId(id); // Set the ID of the doc being edited
      setIsSpotlightOpen(true);
      // Don't remove the doc from the list here!
    }
  };

  const handleRefreshDoc = (id: string) => {
    const doc = docs.find(d => d.id === id);
    if (doc) {
      const updatedDoc = {
        ...doc,
        lastIndexed: `Indexed ${new Date().toLocaleDateString('en-GB', { 
          day: '2-digit', 
          month: '2-digit', 
          year: '2-digit' 
        })}, ${new Date().toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
        })}`
      };
      setDocs(prev => prev.map(d => d.id === id ? updatedDoc : d));
    }
  };

  const handleIndexDoc = (id: string) => {
    // Simulate indexing
    handleRefreshDoc(id);
  };

  const handleCloseModal = () => {
    setIsSpotlightOpen(false);
    setNewDocTitle('');
    setNewDocUrl('');
    setEditingDocId(null); // Reset editing state
  };

  const filteredDocs = docs.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle key press for form submission
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAddDoc();
    }
  };

  // Auto-focus when modal opens
  useEffect(() => {
    if (isSpotlightOpen && titleInputRef.current) {
      // Use setTimeout to ensure the modal is fully rendered
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [isSpotlightOpen]);

  const SwitchToggle: React.FC<SwitchToggleProps> = ({ enabled, onChange }) => (
    <div 
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
        enabled ? 'bg-green-500' : 'bg-gray-600'
      }`}
      onClick={onChange}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </div>
  );

  const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, fileCount, isAnimating = false }) => (
    <div className="space-y-2">
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div 
          className={`bg-blue-500 h-2 rounded-full transition-all duration-300 ${
            isAnimating ? 'animate-pulse' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {fileCount} Resources {isAnimating && '(Syncing...)'}
      </div>
    </div>
  );

  const ActionButton: React.FC<ActionButtonProps> = ({ icon: Icon, onClick, variant = 'default', disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-md transition-colors ${
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : variant === 'danger' 
            ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' 
            : 'hover:bg-gray-700 text-gray-400 hover:text-gray-300'
      }`}
    >
      <Icon className={`w-4 h-4 ${isSync && Icon === RefreshCw ? 'animate-spin' : ''}`} />
    </button>
  );

  const DocItem: React.FC<DocItemProps> = ({ id, icon: Icon, title, subtitle, onEdit, onRefresh, onIndex, onDelete }) => (
    <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800/20 rounded-lg border border-gray-200 dark:border-gray-700/30">
      <div className="flex items-center space-x-3">
        <Icon className="w-5 h-5 text-gray-400" />
        <div>
          <div className="text-gray-900 dark:text-white font-medium">{title}</div>
          <div className="text-gray-700 dark:text-gray-400 text-sm">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center space-x-1">
        <ActionButton icon={Edit3} onClick={onEdit} />
        <ActionButton icon={RotateCcw} onClick={onRefresh} />
        <ActionButton icon={BookOpen} onClick={onIndex} />
        <ActionButton icon={Trash2} onClick={onDelete} variant="danger" />
      </div>
    </div>
  );

  // Handle backdrop click without interfering with input focus
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };

  return (
    <div className="p-6 text-gray-300 min-h-screen">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Indexing & Docs</h1>
        </div>

        {/* Codebase Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-medium text-gray-700 dark:text-gray-300">Kubernetes Resources</h2>
          
          {/* Codebase Indexing */}
          <div className="space-y-3 bg-gray-100 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700/30 p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="text-gray-800 dark:text-white font-medium">Resources Indexing</span>
              <Info className="w-4 h-4 text-gray-700 dark:text-gray-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Embed kubernetes resources for improved contextual understanding and knowledge. 
              Embeddings and metadata are stored in the cloud, but all resources is stored locally.
            </p>
            <ProgressBar percentage={syncProgress} fileCount={syncFileCount} isAnimating={isSync} />
            <div className="flex items-center space-x-4 pt-2">
              <button 
                onClick={handleSync}
                disabled={isSync}
                className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSync ? 'animate-spin' : ''}`} />
                <span>{isSync ? 'Syncing...' : 'Sync'}</span>
              </button>
              <button 
                onClick={handleDeleteIndex}
                className="flex items-center space-x-2 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Index</span>
              </button>
            </div>
          </div>
        </div>

        {/* Docs Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-medium text-gray-700 dark:text-gray-300">Docs</h2>
            <button 
              onClick={() => setIsSpotlightOpen(true)}
              className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Doc</span>
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Crawl and index custom resources and developer docs
          </p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs..."
              className="w-full pl-10 pr-3 py-2 bg-gray-100 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700/30 rounded-md text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Doc Items */}
          <div className="space-y-3">
            {filteredDocs.map((doc) => (
              <DocItem
                key={doc.id}
                id={doc.id}
                icon={doc.type === 'web' ? Globe : FileText}
                title={doc.title}
                subtitle={doc.lastIndexed}
                onEdit={() => handleEditDoc(doc.id)}
                onRefresh={() => handleRefreshDoc(doc.id)}
                onIndex={() => handleIndexDoc(doc.id)}
                onDelete={() => handleDeleteDoc(doc.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Spotlight Modal */}
      {isSpotlightOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
          <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={handleBackdropClick} />
          <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-800">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingDocId ? 'Edit Documentation' : 'Add Documentation'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Document Title
                  </label>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Enter document title..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    URL or File Path
                  </label>
                  <div className="relative">
                    <Link className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      ref={urlInputRef}
                      type="text"
                      value={newDocUrl}
                      onChange={(e) => setNewDocUrl(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="https://docs.agentkube.com"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newDocTitle.trim() || !newDocUrl.trim()}
                  >
                    {editingDocId ? 'Update Documentation' : 'Add Documentation'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Indexing;