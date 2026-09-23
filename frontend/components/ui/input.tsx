import * as React from "react"
import { cn } from "@/lib/utils"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                "flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400",
                className,
            )}
            {...props}
        />
    ),
)
Input.displayName = "Input"
