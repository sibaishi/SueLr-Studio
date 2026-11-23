import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';

/** Native textarea behaviour stays with the caller, including buffered/IME editing. */
export function TextComposer({
  label,
  textareaProps,
  leadingContent,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  textareaProps: ComponentProps<'textarea'>;
  leadingContent?: ReactNode;
}) {
  return (
    <div {...props} className={`text-composer ${className}`}>
      {leadingContent}
      <textarea aria-label={label} {...textareaProps} />
      {children}
    </div>
  );
}
