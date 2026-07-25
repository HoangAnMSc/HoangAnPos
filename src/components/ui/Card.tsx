import { clsx } from "clsx";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-soft",
        className
      )}
      {...props}
    />
  );
}
