import * as React from "react"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50 ${className}`}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"
