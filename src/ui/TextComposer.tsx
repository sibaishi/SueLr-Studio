import type { ComponentProps, HTMLAttributes } from 'react';

/** Native textarea behaviour stays with the caller, including buffered/IME editing. */
export function TextComposer({
  label,
  textareaProps,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  textareaProps: ComponentProps<'textarea'>;
}) {
  return (
    <div {...props} className={`text-composer ${className}`}>
      <textarea aria-label={label} {...textareaProps} />
      {children}
    </div>
  );
}
