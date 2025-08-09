import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"
import { Binoculars } from "lucide-react"
import { AGENTKUBE } from "@/assets";

const Root = SwitchPrimitives.Root as any;
const Thumb = SwitchPrimitives.Thumb as any;

interface ReconModeSwitchProps extends React.ComponentPropsWithoutRef<typeof Root> {
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

const ReconModeSwitch = React.forwardRef<HTMLButtonElement, ReconModeSwitchProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(false);

    const handleCheckedChange = (checked: boolean) => {
      setIsChecked(checked);
      onCheckedChange?.(checked);
    };

    React.useImperativeHandle(ref, () => ({
      click: () => {
        handleCheckedChange(!isChecked);
      }
    } as HTMLButtonElement));

    return (
      <div className="flex items-center">
        {/* Switch with internal text */}
        <Root
          className={cn(
            "peer relative inline-flex h-6 w-16 shrink-0 cursor-pointer items-center rounded-md border-2 border-transparent shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            isChecked
              ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
              : "bg-gray-300 dark:bg-gray-600/20",
            className
          )}
          onCheckedChange={handleCheckedChange}
          {...props}
          ref={ref}
        >
          {/* Text inside the switch track */}
          <span className={cn(
            "absolute text-[9px] font-mono font-medium transition-all duration-300 pointer-events-none select-none",
            isChecked
              ? "left-1.5 text-black "
              : "right-1.5 text-gray-600 dark:text-gray-300"
          )}>
            {isChecked ? "RECON" : "AGENT"}
          </span>

          <Thumb
            className={cn(
              "pointer-events-none flex h-5 w-5 items-center justify-center rounded-md shadow-lg ring-0 transition-all duration-300 z-10",
              isChecked
                ? "translate-x-10 bg-white"
                : "translate-x-0.5 bg-gray-100 dark:bg-gray-600/40"
            )}
          >
            {/* Icon inside the thumb */}
            {isChecked ? (
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