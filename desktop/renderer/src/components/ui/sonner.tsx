import { Toaster as Sonner, type ToasterProps } from "sonner"

import { state } from "@/core/state"

// 底部居中的胶囊 toast,延续旧 renderer 的 #toast 视觉(前景色底、圆角胶囊)。
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = state.store.theme

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "group-toast !bg-foreground !text-background !border-none !rounded-full !px-4.5 !py-2 !text-[12.5px] !font-medium !shadow-overlay !max-w-[80vw]",
          description: "!text-background/70",
          actionButton: "!bg-background !text-foreground !rounded-full",
          cancelButton: "!bg-background/20 !text-background !rounded-full",
        },
      }}
      style={
        {
          "--normal-bg": "var(--foreground)",
          "--normal-text": "var(--background)",
          "--normal-border": "transparent",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
