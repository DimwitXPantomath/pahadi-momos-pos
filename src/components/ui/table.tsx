import * as React from "react"
import { cn } from "@/lib/utils"

// New file, additive only — see card.tsx header comment for context.
// Zebra striped, sticky header, hover highlight per CLAUDE.md's table
// rule, using pos-shadow-sm/border-border/bg-accent to match the
// convention already live in the order-board module rather than plain
// Tailwind shadow-sm/border-gray-100.

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto rounded-xl border border-border/50 pos-shadow-sm">
      <table ref={ref} className={cn("w-full text-sm border-collapse", className)} {...props} />
    </div>
  )
)
Table.displayName = "Table"

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("sticky top-0 z-10 bg-accent/40", className)} {...props} />
  )
)
TableHeader.displayName = "TableHeader"

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("[&>tr:nth-child(even)]:bg-accent/20 [&>tr:hover]:bg-primary/5", className)}
      {...props}
    />
  )
)
TableBody.displayName = "TableBody"

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b border-border/50 last:border-0 transition-colors", className)} {...props} />
  )
)
TableRow.displayName = "TableRow"

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn("h-10 px-3 text-left align-middle font-semibold text-muted-foreground whitespace-nowrap", className)}
      {...props}
    />
  )
)
TableHead.displayName = "TableHead"

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-3 py-2 align-middle", className)} {...props} />
  )
)
TableCell.displayName = "TableCell"
