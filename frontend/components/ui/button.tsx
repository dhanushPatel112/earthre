import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "ghost"
    size?: "default" | "sm"
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50",
                variant === "default" && "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
                variant === "outline" && "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
                variant === "ghost" && "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                size === "default" && "h-10 px-4 py-2 text-sm",
                size === "sm" && "h-8 px-3 text-xs",
                className,
            )}
            {...props}
        />
    )
}
