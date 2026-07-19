import { clsx } from "clsx";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "green" | "amber" | "red" | "neutral";
};

const tones = {
  green: "bg-moss/12 text-moss",
  amber: "bg-clay/12 text-clay",
  red: "bg-red-100 text-red-700",
  neutral: "bg-coal/8 text-white/70",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
