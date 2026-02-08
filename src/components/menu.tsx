"use client"

import { useEffect, useState, useRef } from "react"
import { Airplay, Settings, Sparkles, ChevronLeft, ChevronRight, Home } from "lucide-react"
import { useNavigate, useLocation } from 'react-router-dom';
import SwitchDarkMode from './SwitchDarkMode';
import { useDrawer } from '@/contexts/useDrawer';
import { WindowTitlebar } from "./WindowTitlebar"
import { platform } from '@tauri-apps/plugin-os';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReconModeSwitch } from "./ui/reconmode";
import { NetworkStatus } from "./ui/network-status";
import RECONGIF from '@/assets/recon.gif'
import { Button } from "./ui/button";
import { WorkspaceSwitcher } from "./custom/workspaceswitcher/workspaceswitcher.component";
import { HeaderComponent } from "./custom/header/header.component";
import { Separator } from "./ui/separator";

interface NavigationHistoryState {
  history: string[];
  currentIndex: number;
}

export function Menu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsOpen } = useDrawer();
  const reconSwitchRef = useRef<HTMLButtonElement>(null);
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);

  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryState>({
    history: [location.pathname],
    currentIndex: 0
  });

  // Derived states
  const canGoBack = navigationHistory.currentIndex > 0;
  const canGoForward = navigationHistory.currentIndex < navigationHistory.history.length - 1;

  // Detect platform on component mount
  useEffect(() => {
    const detectPlatform = async () => {
      try {
        const osType = await platform();
        setCurrentPlatform(osType);
      } catch (error) {
        console.error("Failed to detect platform:", error);
        setCurrentPlatform("windows"); // Default fallback
      }
    };

    detectPlatform();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.altKey) && e.key === '/') {
        e.preventDefault();
        // Trigger the switch toggle
        if (reconSwitchRef.current) {
          reconSwitchRef.current.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // When location changes, update our custom history tracker
    const currentPath = location.pathname;

    setNavigationHistory(prev => {
      // If we navigated by using back/forward buttons, just update the index
      if (prev.history.includes(currentPath)) {
        const newIndex = prev.history.indexOf(currentPath);
        return {
          ...prev,
          currentIndex: newIndex
        };
      }

      // Otherwise, we navigated to a new location
      // Trim any forward history and add the new location
      const newHistory = [
        ...prev.history.slice(0, prev.currentIndex + 1),
        currentPath
      ];

      return {
        history: newHistory,
        currentIndex: newHistory.length - 1
      };
    });
  }, [location.pathname]);

  const handleBack = (): void => {
    if (canGoBack) {
      navigate(-1); // Use browser's built-in back navigation
    }
  };

  const handleForward = (): void => {
    if (canGoForward) {
      navigate(1); // Use browser's built-in forward navigation
    }
  };

  // Improved handler with error handling and prevention of default behavior
  const handleOpenDrawer = (e: React.MouseEvent<HTMLButtonElement>): void => {
    try {
      e.preventDefault(); // Prevent any default action
      console.log("Attempting to open drawer");
      setIsOpen(true);
    } catch (error) {
      console.error("Error opening drawer:", error);
    }
  };

  return (
    <WindowTitlebar
      controlsOrder="right"
      windowControlsProps={{ className: "" }}
    >
      <div className="py-[3px] px-4 flex items-center w-full justify-between draggable border-b border-border">

        <div className={`flex items-center gap-2 undraggable ${currentPlatform === 'macos' ? 'ml-[3.5rem]' : 'ml-2'}`}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/')}
                  className="p-1 rounded-md hover:bg-accent text-foreground hover:text-foreground transition-colors"
                >
                  <Home className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-1">
                <p>Home (⌘+D)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Separator orientation="vertical" className="h-5 rounded bg-border" />
          <WorkspaceSwitcher />

        </div>

        {/* Center - Navigation Header */}
        <div className="flex-1 flex justify-center undraggable">
          <HeaderComponent />
        </div>

        {/* Right-side controls */}
        <div className="flex items-center space-x-2 undraggable">
          {/* Network Status */}

          <NetworkStatus />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ReconModeSwitch
                    ref={reconSwitchRef}
                    onCheckedChange={(checked: boolean) => {
                      console.log('Recon mode:', checked ? 'enabled' : 'disabled');
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="p-3 max-w-xs text-foreground bg-card border border-border backdrop-blur-md">
                <div className="space-y-2">
                  <p className="text-foreground"><span className="text-emerald-500 font-bold">RECON</span> Mode</p>
                  <img src={RECONGIF} className="rounded-lg" alt="" />
                  <p className="text-sm text-muted-foreground">
                    Provides secure, read-only access to your Kubernetes cluster. All modifying actions - including create, update, delete, exec, port forwarding, and node operations are disabled.
                  </p>
                  <Button className="w-full hover:bg-secondary bg-secondary text-secondary-foreground">Switch to Agent Mode</Button>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Navigation controls with history indicator */}
          <div className="ml-4 flex items-center space-x-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleBack}
                    className={`p-1 rounded-md hover:bg-accent transition-colors undraggable ${!canGoBack
                      ? 'opacity-30 cursor-not-allowed'
                      : 'cursor-pointer'
                      }`}
                    disabled={!canGoBack}
                  >
                    <ChevronLeft
                      size={18}
                      className={`${canGoBack
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                        }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="p-1">
                  <p>⌘+←</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleForward}
                    className={`p-1 rounded-md hover:bg-accent transition-colors undraggable ${!canGoForward
                      ? 'opacity-30 cursor-not-allowed'
                      : 'cursor-pointer'
                      }`}
                    disabled={!canGoForward}
                  >
                    <ChevronRight
                      size={18}
                      className={`${canGoForward
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                        }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="p-1">
                  <p>⌘+→</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Improved drawer button with explicit role and aria-label for accessibility */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleOpenDrawer}
                  className="p-1 hover:bg-accent cursor-pointer rounded-[0.3rem] transition-colors"
                  role="button"
                  aria-label="Open Assistant"
                >
                  <Sparkles size={15} className="text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-1">
                <p>Talk to Cluster (⌘+L)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>



          <SwitchDarkMode />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/settings')}
                  className="p-1 rounded-md hover:bg-accent transition-colors"
                >
                  <Settings size={15} className="text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-1">
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </WindowTitlebar>
  );
}