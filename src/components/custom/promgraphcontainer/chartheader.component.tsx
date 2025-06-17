import React from 'react';
import { AreaChart, Download, Eye, LineChart, MoreVertical, PaintBucket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ChartHeaderProps {
  title: string;
  description: string;
  onThemeChange?: (theme: string) => void;
  onExport?: () => void;
  onViewDetails?: () => void;
}

const ChartHeader: React.FC<ChartHeaderProps> = ({
  title,
  description,
  onThemeChange,
  onExport,
  onViewDetails
}) => {
  const themes = [
    { name: "Blue (Default)", color: "bg-blue-500", value: "blue" },
    { name: "Orange", color: "bg-orange-500", value: "orange" },
    { name: "Green", color: "bg-green-500", value: "green" },
    { name: "Yellow", color: "bg-yellow-500", value: "yellow" },
    { name: "Gray", color: "bg-gray-500", value: "gray" },
    { name: "Neutral", color: "bg-neutral-500", value: "neutral" },
  ];

  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <div className="space-y-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 dark:bg-[#0B0D13]/40 dark:border-gray-800/40 backdrop-blur-md">
          <div className='py-1'>
            <p className='text-sm dark:text-gray-200 flex items-center space-x-1'><PaintBucket className='h-4 w-4' /> <span>Theme</span></p>
            <div className='flex item-center gap-1'>
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => onThemeChange?.(theme.value)}
                  className='dark:hover:bg-gray-700/50 p-1 rounded-md'
                >
                  <div className={`w-3 h-3 rounded-full ${theme.color}`}></div>

                </button>
              ))}
            </div>

          </div>
          <DropdownMenuItem className='text-xs' onClick={onExport}>
          
            <Download /> Export Chart
          </DropdownMenuItem>
          <DropdownMenuItem className='text-xs' onClick={onViewDetails}>
            <LineChart />
            View Chart
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardHeader>
  );
};

export default ChartHeader;