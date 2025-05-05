"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Window } from "@tauri-apps/api/window";
import { platform } from '@tauri-apps/plugin-os';
import { Minus, Square, X } from "lucide-react";

type WindowControls = {
  platform?: "windows" | "macos" | "linux" | "auto";
  className?: string;
  controls?: Array<"close" | "minimize" | "maximize">;
  justify?: boolean;
  hide?: boolean;
};

type WindowTitlebarProps = {
  children?: React.ReactNode;
  controlsOrder?: "right" | "left" | "platform" | "system";
  windowControlsProps?: WindowControls;
  className?: string;
};

export const WindowTitlebar: React.FC<WindowTitlebarProps> = ({
  children,
  controlsOrder = "right", // Set default to right
  windowControlsProps = {},
  className = "",
}) => {
  const [currentPlatform, setCurrentPlatform] = useState<"windows" | "macos" | "linux" | null>(null);
  const [controlsPosition, setControlsPosition] = useState<"left" | "right">("right"); // Default to right
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = Window.getCurrent();

  // Detect platform on component mount
  useEffect(() => {
    const detectPlatform = async () => {
      try {
        const osType = await platform();
        console.log("Detected OS:", osType);

        if (osType === 'windows') {
          setCurrentPlatform("windows");
          setControlsPosition("right");
        } else if (osType === 'macos') {
          setCurrentPlatform("macos");
          setControlsPosition("left");
        } else if (['linux', 'freebsd', 'dragonfly', 'netbsd', 'openbsd', 'solaris'].includes(osType)) {
          setCurrentPlatform("linux");
          setControlsPosition("right");
        } else {
          // Default fallback to Windows
          console.warn(`Unsupported OS type: ${osType}, falling back to Windows`);
          setCurrentPlatform("windows");
          setControlsPosition("right");
        }
      } catch (error) {
        console.error("Failed to detect platform:", error);
        setCurrentPlatform("windows"); // Default fallback
        setControlsPosition("right");
      }
    };

    detectPlatform();
  }, []);

  // Check if window is maximized
  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.error("Failed to check if window is maximized:", error);
      }
    };

    checkMaximized();

    // Listen for window resize events to update maximized state
    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appWindow]);

  // Window control handlers
  const handleMinimize = useCallback(async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    try {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  }, [appWindow]);

  const handleDrag = useCallback(async (e: React.MouseEvent) => {
    if (e.detail !== 2) { // Not a double-click
      try {
        await appWindow.startDragging();
      } catch (error) {
        console.error("Failed to start dragging:", error);
      }
    }
  }, [appWindow]);

  // Determine actual control position based on props
  const getControlsPosition = (): "left" | "right" => {
    if (controlsOrder === "left") return "left";
    if (controlsOrder === "right") return "right";
    if (controlsOrder === "platform" || controlsOrder === "system") {
      return controlsPosition;
    }
    return "right"; // Default fallback to right
  };

  // Platform-specific controls
  const renderControls = () => {
    const platform = windowControlsProps?.platform || currentPlatform || "windows";

    if (windowControlsProps?.hide) return null;

    if (platform === "macos") {
      return (
        <></>
      );
    } else if (platform === "windows") {
      return (
        <div className={`flex items-center ${windowControlsProps?.className || ""}`}>
          <button
            onClick={handleMinimize}
            className="px-4 py-2.5 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Minimize"
          >
            <Minus className="w-4 h-4 dark:text-gray-200/70 hover:dark:text-gray-100" />
            {/* <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
            </svg> */}
          </button>
          <button
            onClick={handleMaximize}
            className="px-4 py-2.5 hover:bg-gray-200 dark:hover:bg-gray-700"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Square className="h-4 w-4 dark:text-gray-200/70 hover:dark:text-gray-100" />
              // <svg width="12" height="12" viewBox="0 0 12 12">
              //   <path
              //     d="M3.5 4.5v-2h6v6h-2v2h-6v-6h2zm1 1h4v4h-4v-4z"
              //     fill="none"
              //     stroke="currentColor"
              //   />
              // </svg>
            ) : (
              // <svg width="12" height="12" viewBox="0 0 12 12">
              //   <rect
              //     x="1.5"
              //     y="1.5"
              //     width="9"
              //     height="9"
              //     fill="none"
              //     stroke="currentColor"
              //   />
              // </svg>
              <Square className="h-3.5 w-3.5 dark:text-gray-200/70 hover:dark:text-gray-100" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2.5 hover:bg-red-500 hover:text-white"
            title="Close"
          >
            {/* <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M2.5 2.5l7 7m0-7l-7 7"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg> */}
            <X className="w-4 h-4 dark:text-gray-200/70 hover:dark:text-gray-100" />
          </button>
        </div>
      );
    } else {
      // Linux/GNOME style
      return (
        <div className={`flex items-center space-x-2 pr-3 ${windowControlsProps?.className || ""}`}>
          <button
            onClick={handleMinimize}
            className="w-6 h-6 rounded-[0.3rem] mt-1 hover:bg-gray-300 dark:hover:bg-gray-200/20 flex items-center justify-center"
            title="Minimize"
          >
            <Minus className="w-4 h-4 dark:text-gray-200/70 hover:dark:text-gray-100" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-6 h-6 rounded-[0.3rem] mt-1  hover:bg-gray-300 dark:hover:bg-gray-200/20 flex items-center justify-center"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Square className="h-3 w-3 dark:text-gray-200/70 hover:dark:text-gray-100" />
            ) : (
              <Square className="h-3 w-3 dark:text-gray-200/70 hover:dark:text-gray-100" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-6 h-6 rounded-[0.3rem] mt-1  hover:bg-red-500 hover:text-white flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4 dark:text-gray-200/70 hover:dark:text-gray-100" />
          </button>
        </div>
      );
    }
  };

  // If platform is not detected yet, render a placeholder
  if (!currentPlatform) {
    return (
      <div className={`h-8 ${className}`}>
        <div className="w-full h-full" data-tauri-drag-region></div>
      </div>
    );
  }

  const actualControlsPosition = getControlsPosition();

  return (
    <div className={`titlebar h-8 flex items-center ${className}`}>
      {actualControlsPosition === "left" && renderControls()}

      <div
        className="flex-1 h-full"
        data-tauri-drag-region
        onMouseDown={handleDrag}
      >
        {children}
      </div>

      {actualControlsPosition === "right" && renderControls()}
    </div>
  );
};

export default WindowTitlebar;