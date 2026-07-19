import { clsx } from "clsx";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ children, className, id, label, ...props }: SelectProps) {
  const inputId = id ?? props.name;

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-bold text-coal">{label}</span>
      ) : null}
      <select
        className={clsx(
          "w-full rounded-xl border border-moss-200 bg-white px-4 py-3 text-sm font-semibold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100",
          className
        )}
        id={inputId}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
