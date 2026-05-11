import { clsx } from "clsx";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ className, id, label, ...props }: TextareaProps) {
  const inputId = id ?? props.name;

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-bold text-coal">{label}</span>
      ) : null}
      <textarea
        className={clsx(
          "min-h-24 w-full rounded-2xl border border-coal/10 bg-white px-4 py-3 text-sm text-coal outline-none transition placeholder:text-coal/35 focus:border-clay focus:ring-4 focus:ring-clay/15",
          className
        )}
        id={inputId}
        {...props}
      />
    </label>
  );
}
