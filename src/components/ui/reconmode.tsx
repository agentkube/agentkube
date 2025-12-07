import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"
import { Binoculars } from "lucide-react"
import { AGENTKUBE } from "@/assets";
import { useReconMode } from "@/contexts/useRecon";

const Root = SwitchPrimitives.Root as any;
const Thumb = SwitchPrimitives.Thumb as any;

interface ReconModeSwitchProps extends React.ComponentPropsWithoutRef<typeof Root> {
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

const ReconModeSwitch = React.forwardRef<HTMLButtonElement, ReconModeSwitchProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    const { isReconMode, isLoading, setReconMode } = useReconMode();

    const handleCheckedChange = async (checked: boolean) => {
      try {
        await setReconMode(checked);
        onCheckedChange?.(checked);
      } catch (error) {
        console.error('Failed to update recon mode:', error);
      }
    };

    React.useImperativeHandle(ref, () => ({
      click: () => {
        handleCheckedChange(!isReconMode);
      }
    } as HTMLButtonElement));

    return (
      <div className="flex items-center">
        {/* Switch with internal text */}
        <Root
          className={cn(
            "peer relative inline-flex h-6 w-16 shrink-0 cursor-pointer items-center rounded-md border-2 border-transparent shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            isReconMode
              ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
              : "bg-input",
            isLoading && "opacity-50 cursor-not-allowed",
            className
          )}
          checked={isReconMode}
          onCheckedChange={handleCheckedChange}
          disabled={isLoading}
          {...props}
          ref={ref}
        >
          {/* Text inside the switch track */}
          <span className={cn(
            "absolute text-[9px] font-mono font-medium transition-all duration-300 pointer-events-none select-none",
            isReconMode
              ? "left-1.5 text-black "
              : "right-1.5 text-muted-foreground"
          )}>
            {isReconMode ? "RECON" : "AGENT"}
          </span>

          <Thumb
            className={cn(
              "pointer-events-none flex h-5 w-5 items-center justify-center rounded-md shadow-lg ring-0 transition-all duration-300 z-10",
              isReconMode
                ? "translate-x-10 bg-white"
                : "translate-x-0.5 bg-muted"
            )}
          >
            {/* Icon inside the thumb */}
            {isReconMode ? (
              <Binoculars className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <img src={AGENTKUBE} className="h-4 w-4" />
            )}
          </Thumb>
        </Root>
      </div>
    );
  }
);

ReconModeSwitch.displayName = "ReconModeSwitch";

export { ReconModeSwitch };