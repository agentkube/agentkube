import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// CSS for streaming animations - inject styles
const timelineStyles = `
@keyframes timeline-slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes timeline-pulse-glow {
  0%, 100% {
    box-shadow: 0 0 4px 1px rgba(59, 130, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(59, 130, 246, 0.6);
  }
}

@keyframes timeline-separator-grow {
  from {
    transform: scaleY(0);
    transform-origin: top;
  }
  to {
    transform: scaleY(1);
    transform-origin: top;
  }
}

.timeline-animate-in {
  animation: timeline-slide-in 0.3s ease-out forwards;
}

.timeline-pulse-active {
  animation: timeline-pulse-glow 2s ease-in-out infinite;
}

.timeline-separator-animate {
  animation: timeline-separator-grow 0.3s ease-out forwards;
}
`;

// Inject styles once
if (typeof document !== 'undefined') {
  const styleId = 'timeline-animations';
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = timelineStyles;
    document.head.appendChild(styleSheet);
  }
}

// Types
type TimelineContextValue = {
  activeStep: number
  setActiveStep: (step: number) => void
}

// Context
const TimelineContext = React.createContext<TimelineContextValue | undefined>(
  undefined
)

const useTimeline = () => {
  const context = React.useContext(TimelineContext)
  if (!context) {
    throw new Error("useTimeline must be used within a Timeline")
  }
  return context
}

// Components
interface TimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: number
  value?: number
  onValueChange?: (value: number) => void
  orientation?: "horizontal" | "vertical"
}

function Timeline({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = "vertical",
  className,
  ...props
}: TimelineProps) {
  const [activeStep, setInternalStep] = React.useState(defaultValue)

  const setActiveStep = React.useCallback(
    (step: number) => {
      if (value === undefined) {
        setInternalStep(step)
      }
      onValueChange?.(step)
    },
    [value, onValueChange]
  )

  const currentStep = value ?? activeStep

  return (
    <TimelineContext.Provider
      value={{ activeStep: currentStep, setActiveStep }}
    >
      <div
        data-slot="timeline"
        className={cn(
          "group/timeline flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
          className
        )}
        data-orientation={orientation}
        {...props}
      />
    </TimelineContext.Provider>
  )
}

// TimelineContent
function TimelineContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="timeline-content"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

// TimelineDate
interface TimelineDateProps extends React.HTMLAttributes<HTMLTimeElement> {
  asChild?: boolean
}

function TimelineDate({
  asChild = false,
  className,
  ...props
}: TimelineDateProps) {
  const Comp = asChild ? Slot.Root : "time"

  return (
    <Comp
      data-slot="timeline-date"
      className={cn(
        "text-muted-foreground mb-1 block text-xs font-medium group-data-[orientation=vertical]/timeline:max-sm:h-4",
        className
      )}
      {...props}
    />
  )
}

// TimelineHeader
function TimelineHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="timeline-header" className={cn(className)} {...props} />
  )
}

// TimelineIndicator
interface TimelineIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
  pulse?: boolean
}

function TimelineIndicator({
  asChild = false,
  className,
  children,
  pulse = false,
  ...props
}: TimelineIndicatorProps) {
  return (
    <div
      data-slot="timeline-indicator"
      className={cn(
        "border-muted-foreground/20 group-data-completed/timeline-item:border-muted-foreground absolute size-2 rounded-full border-2 group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:left-0 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 transition-all duration-300",
        pulse && "timeline-pulse-active",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineItem
interface TimelineItemProps extends React.HTMLAttributes<HTMLDivElement> {
  step: number
  animate?: boolean
  isActive?: boolean
}

function TimelineItem({ step, className, animate = false, isActive = false, ...props }: TimelineItemProps) {
  const { activeStep } = useTimeline()

  return (
    <div
      data-slot="timeline-item"
      className={cn(
        "group/timeline-item has-[+[data-completed]]:[&_[data-slot=timeline-separator]]:bg-muted-foreground relative flex flex-1 flex-col gap-0.5 group-data-[orientation=horizontal]/timeline:mt-8 group-data-[orientation=horizontal]/timeline:not-last:pe-8 group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=vertical]/timeline:not-last:pb-12 transition-all duration-300",
        animate && "timeline-animate-in",
        isActive && "relative",
        className
      )}
      data-completed={step <= activeStep || undefined}
      data-active={isActive || undefined}
      {...props}
    />
  )
}

// TimelineSeparator
interface TimelineSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  animate?: boolean
}

function TimelineSeparator({
  className,
  animate = false,
  ...props
}: TimelineSeparatorProps) {
  return (
    <div
      data-slot="timeline-separator"
      className={cn(
        "bg-muted-foreground/20 absolute self-start group-last/timeline-item:hidden group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=horizontal]/timeline:w-[calc(100%-1rem-0.25rem)] group-data-[orientation=horizontal]/timeline:translate-x-4.5 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-full group-data-[orientation=vertical]/timeline:w-0.5 group-data-[orientation=vertical]/timeline:-translate-x-1/2 group-data-[orientation=vertical]/timeline:top-1 transition-colors duration-300",
        animate && "timeline-separator-animate",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

// TimelineTitle
function TimelineTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="timeline-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  )
}

export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
}
