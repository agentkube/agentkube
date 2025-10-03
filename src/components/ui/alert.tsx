import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border border-slate-200 px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-slate-950 [&>svg~*]:pl-7 dark:border-slate-800",
  {
    variants: {
      variant: {
        default: "bg-white dark:bg-transparent",
        warning: "bg-yellow-500/10 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-600 dark:border-yellow-600/60 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400",
        destructive: "bg-red-500/10 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-600 dark:border-red-600/60 [&>svg]:text-red-600 dark:[&>svg]:text-red-400",
        info: "bg-blue-500/10 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-600 dark:border-blue-600/60 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400",
        success: "bg-green-500/10 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-600 dark:border-green-600/60 [&>svg]:text-green-600 dark:[&>svg]:text-green-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-0.5 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
