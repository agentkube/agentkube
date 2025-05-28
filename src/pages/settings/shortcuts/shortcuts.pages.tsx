// Import necessary dependencies
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { platform } from '@tauri-apps/plugin-os';

// Define shortcut mapping type
type Shortcut = {
  macos: string;
  windows: string;
  linux: string;
  description: string;
};

const Shortcuts = () => {
  const [feedback, setFeedback] = useState('');
  const [currentPlatform, setCurrentPlatform] = useState<'macos' | 'windows' | 'linux'>('macos');
  const [isLoading, setIsLoading] = useState(true);

  // All shortcuts organized by category
  const shortcutCategories = {
    general: [
      { macos: '⌘ H', windows: 'Ctrl+H', linux: 'Ctrl+H', description: 'Navigate to Home' },
      { macos: '⌘ K', windows: 'Ctrl+K', linux: 'Ctrl+K', description: 'Kube spotlight' },
      { macos: '⌘ L', windows: 'Ctrl+L', linux: 'Ctrl+L', description: 'Talk to cluster Panel' },
      { macos: '⌘ ←', windows: 'Alt+←', linux: 'Alt+←', description: 'Navigate Back' },
      { macos: '⌘ →', windows: 'Alt+→', linux: 'Alt+→', description: 'Navigate Forward' },
      { macos: '⌘ S', windows: 'Ctrl+S', linux: 'Ctrl+S', description: 'Collapse Sidebar' },
    ],
    zoom: [
      { macos: '⌘ 0', windows: 'Ctrl+0', linux: 'Ctrl+0', description: 'Reset Zoom' },
      { macos: '⌘ -', windows: 'Ctrl+-', linux: 'Ctrl+-', description: 'Zoom Out' },
      { macos: '⌘ +', windows: 'Ctrl++', linux: 'Ctrl++', description: 'Zoom In' },
    ],
    resources: [
      { macos: '⌘ N', windows: 'Ctrl+N', linux: 'Ctrl+N', description: 'Namespace Selector' },
      { macos: '⌘ F', windows: 'Ctrl+F', linux: 'Ctrl+F', description: 'Focus on Filter' },
      { macos: '⌘ P', windows: 'Ctrl+P', linux: 'Ctrl+P', description: 'PromQL spotlight' },
    ],
  };

  useEffect(() => {
    const detectPlatform = async () => {
      try {
        setIsLoading(true);
        const osType = await platform();
        console.log("Detected OS:", osType);

        if (osType === 'macos') {
          setCurrentPlatform('macos');
        } else if (osType === 'windows') {
          setCurrentPlatform('windows');
        } else if (['linux', 'freebsd', 'dragonfly', 'netbsd', 'openbsd', 'solaris'].includes(osType)) {
          setCurrentPlatform('linux');
        } else {
          // Default fallback to Windows
          console.warn(`Unsupported OS type: ${osType}, falling back to Windows`);
          setCurrentPlatform('windows');
        }
      } catch (error) {
        console.error("Failed to detect platform:", error);
        setCurrentPlatform('windows'); // Default fallback
      } finally {
        setIsLoading(false);
      }
    };

    detectPlatform();
  }, []);

  const handleFeedbackSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would handle the feedback submission
    console.log('Feedback submitted:', feedback);
    setFeedback('');
  };

  // Helper function to render each shortcut based on platform
  const renderShortcutList = (category: Shortcut[]) => {
    return category.map((shortcut, index) => (
      <div className="flex" key={index}>
        <div className="w-24 text-gray-500">
          <span className="text-sm">{shortcut[currentPlatform]}</span>
        </div>
        <div>{shortcut.description}</div>
      </div>
    ));
  };

  if (isLoading) {
    return (
      <div className="p-4 text-gray-800 dark:text-white">
        <p>Loading shortcuts...</p>
      </div>
    );
  }

  return (
    <div className="p-4 text-gray-800 dark:text-white">
      <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Keyboard Shortcuts</h1>
      
      {/* Platform indicator */}
      <div className="mb-4 text-sm text-gray-500">
        Showing shortcuts for {currentPlatform === 'macos' ? 'macOS' : currentPlatform === 'windows' ? 'Windows' : 'Linux'}
      </div>

      {/* General Section */}
      <div className="mb-6">
        <h2 className="text-base font-medium mb-3">General</h2>
        <div className="space-y-2">
          {renderShortcutList(shortcutCategories.general)}
        </div>
      </div>

      {/* Zoom Section */}
      <div className="mb-6">
        <h2 className="text-base font-medium mb-3">Zoom</h2>
        <div className="space-y-2">
          {renderShortcutList(shortcutCategories.zoom)}
        </div>
      </div>

      {/* Resources Section */}
      <div className="mb-10">
        <h2 className="text-base font-medium mb-3">Resources</h2>
        <div className="space-y-2">
          {renderShortcutList(shortcutCategories.resources)}
        </div>
      </div>

      {/* Feedback Section */}
      <div className="mt-8 pb-4">
        <div className="flex items-center text-gray-400">
          <span className="mr-2">✨</span>
          <span className="text-sm">Let us know what shortcuts you'd like see being added.</span>
        </div>
        <div className='py-2'>
          <Button data-tally-open="n94eZY" data-tally-emoji-text="👋" data-tally-width="500" data-tally-emoji-animation="bounce">
            Request Shortcut <Send className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Shortcuts;