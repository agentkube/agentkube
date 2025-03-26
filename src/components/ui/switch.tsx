import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

// Using `as any` to bypass type checking issues with Radix UI components
// This is a workaround for the specific type errors you're encountering
const Root = SwitchPrimitives.Root as any;
const Thumb = SwitchPrimitives.Thumb as any;

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof Root> {
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
      ref={ref}
    >
      <Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-gray-700 shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )}
      />
    </Root>
  )
);

Switch.displayName = "Switch";

export { Switch }