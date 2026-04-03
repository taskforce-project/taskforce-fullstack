import * as React from "react"
import { cn } from "@/lib/utils"

interface PodProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly title?: string
  readonly description?: string
  readonly action?: React.ReactNode
  readonly children: React.ReactNode
}

/**
 * Pod — modular container component inspired by Globant's design system
 * Modern, clean styling with subtle gradients and shadows
 */
const Pod = React.forwardRef<HTMLDivElement, PodProps>(
  ({ title, description, action, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md",
          className
        )}
        {...props}
      >
        {(title || description || action) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex-1 space-y-1.5">
              {title && (
                <h3 className="text-base font-semibold leading-none tracking-tight">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {action && <div className="flex items-center">{action}</div>}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    )
  }
)
Pod.displayName = "Pod"

interface PodHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly children: React.ReactNode
}

/**
 * PodHeader — custom header for advanced pod layouts
 */
const PodHeader = React.forwardRef<HTMLDivElement, PodHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("border-b border-border px-5 py-4", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
PodHeader.displayName = "PodHeader"

interface PodContentProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly children: React.ReactNode
}

/**
 * PodContent — content area for pod
 */
const PodContent = React.forwardRef<HTMLDivElement, PodContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("p-5", className)} {...props}>
        {children}
      </div>
    )
  }
)
PodContent.displayName = "PodContent"

export { Pod, PodHeader, PodContent }
