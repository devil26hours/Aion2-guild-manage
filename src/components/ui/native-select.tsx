import * as React from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

/** Styled native <select> — accessible and mobile-friendly. */
function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative", wrapperClassName)}>
      <select
        data-slot="native-select"
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60"
      />
    </div>
  )
}

export { NativeSelect }
