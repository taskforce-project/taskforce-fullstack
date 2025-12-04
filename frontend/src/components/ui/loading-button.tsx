import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: React.ReactNode;
  loadingText?: string;
}

export function LoadingButton({
  isLoading = false,
  children,
  loadingText,
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <button
      className={cn(className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin inline-block" />
          {loadingText || "Chargement..."}
        </>
      ) : (
        children
      )}
    </button>
  );
}
