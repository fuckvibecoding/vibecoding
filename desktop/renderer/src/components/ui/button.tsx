import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[12.5px] font-medium transition-all disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-panel hover:bg-primary/88",
        destructive: "bg-destructive text-destructive-foreground shadow-panel hover:bg-destructive/90",
        outline: "border border-input bg-card hover:border-primary hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-hoverbg hover:text-strong",
        link: "text-primary underline-offset-4 hover:underline",
        // 允许执行(审批卡片主操作)
        allow: "bg-primary text-primary-foreground font-semibold shadow-panel hover:bg-primary/88",
        // 拒绝/危险轮廓(审批拒绝、删除)
        deny: "border border-input bg-card hover:border-destructive hover:text-destructive",
      },
      size: {
        default: "h-8 px-3.5 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-[12px]",
        lg: "h-9 rounded-lg px-5",
        icon: "size-7 rounded-md",
        "icon-sm": "size-6 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
