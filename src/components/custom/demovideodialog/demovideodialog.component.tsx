"use client"

import React from 'react';
import { YouTubePlayer } from "@/components/ui/ytvideoplayer";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface DemoVideoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  title: string;
  className?: string;
  maxWidth?: string;
}

const DemoVideoDialog: React.FC<DemoVideoDialogProps> = ({ 
  isOpen, 
  onClose, 
  videoId, 
  title,
  className = "",
  maxWidth = "max-w-4xl"
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${maxWidth} w-[90vw] p-8 border-transparent bg-transparent backdrop-blur-xl ${className}`}>
        <div className="flex-1 flex items-center justify-center">
          <YouTubePlayer
            videoId={videoId}
            title={title}
            className="w-full"
            containerClassName="border-transparent rounded-2xl shadow-2xl bg-transparent"
            thumbnailImageClassName="opacity-90"
            playButtonClassName="bg-gray-300/20 dark:bg-gray-500/20 border-transparent hover:bg-white/10 dark:hover:bg-gray-500/30 backdrop-blur-sm"
            playIconClassName="text-green fill-white"
            titleClassName="text-white font-medium"
            controlsClassName="right-4 top-4"
            expandButtonClassName="bg-gray-300/20 dark:bg-gray-500/20  border-transparent hover:bg-white/10 text-white backdrop-blur-sm"
            backdropClassName="bg-black/80 backdrop-blur-sm"
            playerClassName="bg-gray-300/20 dark:bg-gray-500/20 "
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemoVideoDialog;