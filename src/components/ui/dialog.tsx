import * as React from "react"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => onOpenChange?.(false)}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div onClick={e => e.stopPropagation()} className="relative z-10">
        {children}
      </div>
    </div>
  )
}

export function DialogContent({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-xl overflow-hidden ${className}`}>
      {children}
    </div>
  )
}
