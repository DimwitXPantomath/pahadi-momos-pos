import * as React from "react"
import { cn } from "@/lib/utils"

// New file, additive only — see card.tsx header comment for context.

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none text-foreground", className)}
      {...props}
    />
  )
)
Label.displayName = "Label"
