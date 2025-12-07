"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      position="bottom-right"
      className="toaster group"
      visibleToasts={7}
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:border-2 group-[.toaster]:backdrop-blur-md",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:opacity-90 group-[.toast]:font-dm-sans",
          title: "group-[.toast]:text-md group-[.toast]:font-semibold group-[.toast]:font-[Anton] group-[.toast]:uppercase",
          actionButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-primary group-[.toast]:text-primary-foreground hover:group-[.toast]:bg-primary/90",
          cancelButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground hover:group-[.toast]:bg-secondary/80",
          closeButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground",
          success: "group-[.toast]:font-dm-sans group toast group-[.toaster]:bg-card group-[.toaster]:text-emerald-700 group-[.toaster]:border-emerald-600 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:border-2 group-[.toaster]:backdrop-blur-md",
          error: "group-[.toast]:font-dm-sans group toast group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-md",
        },
        style: {
          background: 'transparent',
        }
      }}
      {...props}
    />
  )
}

export { Toaster }