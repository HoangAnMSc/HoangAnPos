import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  isLoading?: boolean;
};

const variants = {
  primary: "bg-coal text-white hover:-translate-y-0.5 hover:shadow-lift",
  secondary: "bg-white text-coal ring-1 ring-coal/10 hover:bg-cream",
  ghost: "bg-transparent text-coal hover:bg-coal/5",
  danger: "bg-red-600 text-white hover:-translate-y-0.5 hover:bg-red-700",
};

export function Button({
  children,
  className,
  disabled,
  isLoading,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
