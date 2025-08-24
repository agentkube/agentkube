"use client"

import { useEffect, useState, useRef } from "react"
import { Airplay, Settings, Sparkles, ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate, useLocation } from 'react-router-dom';
import SwitchDarkMode from './SwitchDarkMode';
import { useDrawer } from '@/contexts/useDrawer';
import { WindowTitlebar } from "./WindowTitlebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReconModeSwitch } from "./ui/reconmode";
import RECONGIF from '@/assets/recon.gif'
import { Button } from "./ui/button";

interface NavigationHistoryState {
  history: string[];
  currentIndex: number;
}

export function Menu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsOpen } = useDrawer();
  const reconSwitchRef = useRef<HTMLButtonElement>(null);

  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryState>({
    history: [location.pathname],
    currentIndex: 0
  });

  // Derived states
  const canGoBack = navigationHistory.currentIndex > 0;
  const canGoForward = navigationHistory.currentIndex < navigationHistory.history.length - 1;

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
      <div className="py-[3px] px-4 flex items-center w-full justify-between draggable border-b dark:border-gray-300/10">
        <div className="inline-flex ml-2 space-x-1.5">
          {/* Window Controls */}
        </div>



        {/* Right-side controls */}
        <div className="flex items-center space-x-2 undraggable">
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
              <TooltipContent className="p-3 max-w-xs text-black bg-gray-50 dark:bg-[#0B0D13]/40 border border-gray-800/20 dark:border-gray-500/20 backdrop-blur-md">
                <div className="space-y-2">
                  <p className="dark:text-gray-200"><span className="dark:text-emerald-500 font-bold">RECON</span> Mode</p>
                  <img src={RECONGIF} className="rounded-lg" alt="" />
                  <p className="text-sm dark:text-gray-400">
                    Provides secure, read-only access to your Kubernetes cluster. All modifying actions - including create, update, delete, exec, port forwarding, and node operations are disabled.
                  </p>
                  <Button className="w-full dark:hover:bg-gray-400 dark:bg-gray-200 dark:text-gray-800">Switch to Agent Mode</Button>
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
                    className={`p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors undraggable ${!canGoBack
                      ? 'opacity-30 cursor-not-allowed'
                      : 'cursor-pointer'
                      }`}
                    disabled={!canGoBack}
                  >
                    <ChevronLeft
                      size={18}
                      className={`${canGoBack
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-gray-400 dark:text-gray-500'
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
                    className={`p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors undraggable ${!canGoForward
                      ? 'opacity-30 cursor-not-allowed'
                      : 'cursor-pointer'
                      }`}
                    disabled={!canGoForward}
                  >
                    <ChevronRight
                      size={18}
                      className={`${canGoForward
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-gray-400 dark:text-gray-500'
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
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-[0.3rem] transition-colors"
                  role="button"
                  aria-label="Open Assistant"
                >
                  <Sparkles size={15} className="text-gray-700 dark:text-gray-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-1">
                <p>Talk to Cluster (⌘+L)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/')}
                  className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Airplay size={15} className="text-gray-700 dark:text-gray-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-1">
                <p>Home (⌘+D)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <SwitchDarkMode />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/settings')}
                  className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Settings size={15} className="text-gray-700 dark:text-gray-300" />
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