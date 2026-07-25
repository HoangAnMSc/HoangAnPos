import { clsx } from "clsx";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "green" | "amber" | "red" | "neutral";
};

const tones = {
  green: "bg-moss-100 text-moss-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
