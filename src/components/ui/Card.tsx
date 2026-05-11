import { clsx } from "clsx";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-[2rem] border border-white/70 bg-white/82 p-5 shadow-soft backdrop-blur",
        className
      )}
      {...props}
    />
  );
}
