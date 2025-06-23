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
          toast: "group toast group-[.toaster]:bg-gray-50 group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:border-2 group-[.toaster]:backdrop-blur-md dark:group-[.toaster]:bg-[#0B0D13]/30 dark:group-[.toaster]:text-slate-50 dark:group-[.toaster]:border-gray-800/50",
          description: "group-[.toast]:text-slate-700 dark:group-[.toast]:text-slate-400 group-[.toast]:opacity-90 group-[.toast]:font-dm-sans",
          title: "group-[.toast]:text-md group-[.toast]:font-semibold group-[.toast]:font-[Anton] group-[.toast]:uppercase",
          actionButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-zinc-900 group-[.toast]:text-zinc-50 hover:group-[.toast]:bg-zinc-800 dark:group-[.toast]:bg-zinc-50 dark:group-[.toast]:text-zinc-900 dark:hover:group-[.toast]:bg-zinc-200",
          cancelButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-500 hover:group-[.toast]:bg-zinc-200 dark:group-[.toast]:bg-zinc-700 dark:group-[.toast]:text-zinc-400 dark:hover:group-[.toast]:bg-zinc-600",
          closeButton: "group-[.toast]:font-dm-sans group-[.toast]:bg-transparent group-[.toast]:text-slate-950/50 hover:group-[.toast]:text-slate-950 dark:group-[.toast]:text-slate-50/50 dark:hover:group-[.toast]:text-slate-50",
          success: "group-[.toast]:font-dm-sans group toast group-[.toaster]:bg-gray-50 group-[.toaster]:text-emerald-700 group-[.toaster]:border-green-800 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:border-2 group-[.toaster]:backdrop-blur-md dark:group-[.toaster]:bg-[#0B0D13]/30 dark:group-[.toaster]:text-emerald-500 dark:group-[.toaster]:border-green-800/50",
          error: "group-[.toast]:font-dm-sans group toast group-[.toaster]:bg-red-500 group-[.toaster]:text-slate-50 group-[.toaster]:border-red-500 group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-md dark:group-[.toaster]:bg-red-900/40 dark:group-[.toaster]:text-slate-50 dark:group-[.toaster]:border-red-900",
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