import * as React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    const variants = {
      default: "bg-black text-white hover:bg-gray-800",
      outline: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
      ghost: "bg-transparent text-gray-800 hover:bg-gray-100",
    }
    const sizes = {
      default: "px-4 py-2 text-sm",
      sm: "px-3 py-1.5 text-xs",
      lg: "px-6 py-3 text-base",
    }
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
