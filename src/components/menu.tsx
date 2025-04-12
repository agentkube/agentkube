"use client"

import { useCallback, useEffect, useState } from "react"
import { Airplay, Settings, Sparkles, ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate, useLocation } from 'react-router-dom';
import SwitchDarkMode from './SwitchDarkMode';
import { useDrawer } from '@/contexts/useDrawer';
import { WindowTitlebar } from "./WindowTitlebar"

interface NavigationHistoryState {
  history: string[];
  currentIndex: number;
}

export function Menu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsOpen } = useDrawer();
  
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryState>({
    history: [location.pathname],
    currentIndex: 0
  });

  // Derived states
  const canGoBack = navigationHistory.currentIndex > 0;
  const canGoForward = navigationHistory.currentIndex < navigationHistory.history.length - 1;

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
      <div className="py-1 px-4 flex items-center w-full justify-between draggable">
        <div className="inline-flex ml-2 space-x-1.5">
          {/* Window Controls */}
        </div>

        {/* Right-side controls */}
        <div className="flex items-center space-x-2 undraggable">
          {/* Navigation controls with history indicator */}
          <div className="ml-4 flex items-center space-x-1">
            <button
              onClick={handleBack}
              className={`p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors undraggable ${!canGoBack
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer'
                }`}
              title="Go back"
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
            <button
              onClick={handleForward}
              className={`p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors undraggable ${!canGoForward
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer'
                }`}
              title="Go forward"
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
          </div>

          {/* Improved drawer button with explicit role and aria-label for accessibility */}
          <button
            onClick={handleOpenDrawer}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-[0.3rem] transition-colors"
            title="Assistant"
            role="button"
            aria-label="Open Assistant"
          >
            <Sparkles size={15} className="text-gray-700 dark:text-gray-300" />
          </button>

          <button
            onClick={() => navigate('/')}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Airplay"
          >
            <Airplay size={15} className="text-gray-700 dark:text-gray-300" />
          </button>

          <SwitchDarkMode />

          <button
            onClick={() => navigate('/settings')}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Settings"
          >
            <Settings size={15} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </div>
    </WindowTitlebar>
  );
}