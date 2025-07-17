import { Toaster as Sonner, ToasterProps } from "sonner"
import { useTheme } from "../theme-provider"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  
  return (
    <Sonner
      theme={theme as "light" | "dark" | "system" | undefined}
      className="toaster group"
      position="top-center"
      offset={48}
      toastOptions={{
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          border: "2px solid var(--border)",
          borderRadius: "8px",
          boxShadow: theme === "dark" 
            ? "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)" 
            : "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
