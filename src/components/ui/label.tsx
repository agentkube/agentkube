"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Using type assertion to bypass compatibility issues
const Root = LabelPrimitive.Root as any;

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

interface LabelProps extends React.ComponentPropsWithoutRef<typeof Root>,
  VariantProps<typeof labelVariants> {
  className?: string;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <Root
      ref={ref}
      className={cn(labelVariants(), className)}
      {...props}
    />
  )
)

Label.displayName = "Label"

export { Label }