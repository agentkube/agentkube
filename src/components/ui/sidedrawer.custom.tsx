import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion, AnimatePresence } from 'framer-motion';
import { drawerVariants, backdropVariants } from '@/utils/styles.utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  offsetTop?: string;
}

interface DrawerHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
}

interface DrawerContentProps {
  children: React.ReactNode;
  className?: string;
}

const DrawerHeader: React.FC<DrawerHeaderProps> = ({ children, onClose }) => {
  return (
    <div className="px-2 py-2 bg-gray-200 dark:bg-gray-800/20 flex items-center justify-between">
      {children}
      {onClose && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="p-1 text-gray-800 dark:text-gray-500"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

const DrawerContent: React.FC<DrawerContentProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`flex-grow 
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
        overflow-auto transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
};

const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, children, offsetTop = "top-0" }) => {
  const [drawerMounted, setDrawerMounted] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    setDrawerMounted(true);
    return () => {
      setDrawerMounted(false);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleClose = (): void => {
    try {
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 300);
    } catch (error) {
      console.error("Error closing drawer:", error);
      onClose();
      setIsClosing(false);
    }
  };

  // Early return only after mounted check to avoid hydration issues
  if (!drawerMounted || !isOpen) return null;

  return (
    <TooltipProvider>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop with animation */}
            <motion.div
              className="fixed inset-0 bg-black/20 dark:bg-gray-900/40 z-40"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={backdropVariants}
              onClick={handleClose}
            />

            {/* Drawer with smooth animation */}
            <motion.div
              className={`fixed ${offsetTop} right-0 h-full w-1/2 bg-gray-100 dark:bg-[#0B0D13]/60 backdrop-blur-lg shadow-lg z-40`}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              <div className="flex flex-col h-full">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
};

export {
  SideDrawer,
  DrawerHeader,
  DrawerContent,
}