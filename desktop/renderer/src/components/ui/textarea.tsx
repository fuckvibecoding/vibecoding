import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-inputbg px-3 py-2 text-[12.5px] shadow-xs transition-[color,box-shadow] outline-none",
        "placeholder:text-faint",
        "hover:border-faint",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12",
        "disabled:cursor-not-allowed disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
