import { clsx } from "clsx";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-moss-100 bg-white/90 p-5 shadow-soft backdrop-blur",
        className
      )}
      {...props}
    />
  );
}
