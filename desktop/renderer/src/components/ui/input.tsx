import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8.5 w-full min-w-0 rounded-lg border border-input bg-inputbg px-2.5 py-1.5 text-[12.5px] shadow-xs transition-[color,box-shadow] outline-none",
        "placeholder:text-faint",
        "hover:border-faint",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12",
        "disabled:cursor-not-allowed disabled:opacity-70",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
