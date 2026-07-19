import { clsx } from "clsx";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ className, error, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-bold text-coal">{label}</span>
      ) : null}
      <input
        className={clsx(
          "w-full rounded-xl border border-moss-200 bg-white px-4 py-3 text-sm text-coal outline-none transition placeholder:text-coal/35 focus:border-moss-500 focus:ring-4 focus:ring-moss-100",
          error && "border-red-400 focus:border-red-500 focus:ring-red-100",
          className
        )}
        id={inputId}
        {...props}
      />
      {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : null}
    </label>
  );
}
