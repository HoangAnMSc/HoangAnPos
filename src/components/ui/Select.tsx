import { clsx } from "clsx";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ children, className, id, label, ...props }: SelectProps) {
  const inputId = id ?? props.name;

  return (
    <label className="block min-w-0">
      {label ? (
        <span className="mb-2 block text-sm font-bold text-coal">{label}</span>
      ) : null}
      <select
        className={clsx(
          "w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-coal outline-none transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 focus:border-moss-500 focus:ring-4 focus:ring-moss-100",
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
