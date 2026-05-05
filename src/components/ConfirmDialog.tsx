import { useState, useCallback } from "react"

// ── Types ─────────────────────────────────────────────────────────
type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmState = ConfirmOptions & {
  isOpen: boolean
  resolve: ((value: boolean) => void) | null
}

// ── Hook ──────────────────────────────────────────────────────────
export const useConfirm = () => {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    danger: false,
    resolve: null,
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({
        ...options,
        isOpen: true,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        resolve,
      })
    })
  }, [])

  const handleConfirm = () => {
    state.resolve?.(true)
    setState(s => ({ ...s, isOpen: false, resolve: null }))
  }

  const handleCancel = () => {
    state.resolve?.(false)
    setState(s => ({ ...s, isOpen: false, resolve: null }))
  }

  return { confirm, confirmState: state, handleConfirm, handleCancel }
}

// ── Component ─────────────────────────────────────────────────────
type Props = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 16,
          padding: "24px 28px", width: "100%", maxWidth: 380,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          animation: "fadeIn .15s ease",
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: "0 0 8px" }}>
          {title}
        </p>
        <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "10px", borderRadius: 8,
              border: "1.5px solid #e5e7eb", background: "white",
              color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >{cancelLabel}</button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "10px", borderRadius: 8, border: "none",
              background: danger ? "#dc2626" : "#111",
              color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
