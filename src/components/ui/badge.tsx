import * as React from "react"
import { cn } from "@/lib/utils"

// New file, additive only — see card.tsx header comment for context.
// Two variant groups:
//  - "status" variants map to the live order-status tokens in
//    src/index.css (--status-placed/preparing/ready/collected), styled
//    per pos-uiux-design-guide.md's rule: bg-status-<name>/15 background,
//    text-status-<name> text. Pass `pulse` for the READY state to reuse
//    the already-defined .status-pulse keyframe animation.
//  - generic variants cover the non-order badges CLAUDE.md's own
//    component rules call for (Procurement's Draft/Sent/Confirmed/
//    Completed/Low Stock/Best Price), which aren't part of the order
//    lifecycle and have no status-* token of their own.

const variantClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary border border-primary/20",
  secondary: "bg-secondary text-secondary-foreground border border-transparent",
  brand: "bg-brand-accent/10 text-brand-accent border border-brand-accent/20",
  destructive: "bg-destructive/10 text-destructive border border-destructive/20",
  success: "bg-green-100 text-green-700 border border-green-200",
  warning: "bg-amber-100 text-amber-700 border border-amber-200",
  outline: "text-foreground border border-border",
  gray: "bg-gray-100 text-gray-600 border border-gray-200",
  placed: "bg-status-placed/15 text-status-placed",
  preparing: "bg-status-preparing/15 text-status-preparing",
  ready: "bg-status-ready/15 text-status-ready",
  collected: "bg-status-collected/15 text-status-collected",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variantClasses
  pulse?: boolean
}

export function Badge({ className, variant = "default", pulse = false, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        variantClasses[variant],
        pulse && "status-pulse",
        className
      )}
      {...props}
    />
  )
}
