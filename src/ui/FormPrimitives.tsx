import { CaretDown, Eye, EyeSlash } from '@phosphor-icons/react';
import { type ComponentProps, type CSSProperties, type ReactNode, useState } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  accent?: string;
  small?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  label?: ReactNode;
};

export function Button({
  accent,
  small,
  variant = 'primary',
  className = '',
  children,
  label,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`ui-button ${className}`}
      data-size={small ? 'compact' : undefined}
      data-variant={variant}
      style={accent ? ({ '--ui-button-accent': accent, ...style } as CSSProperties) : style}
    >
      {children ?? label}
    </button>
  );
}

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function TextInput({ type = 'text', value, onChange, className = '', ...props }: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const password = type === 'password';
  const passwordAction = passwordVisible ? '隐藏密码' : '显示密码';

  return (
    <span className="ui-input-frame" data-password={password || undefined}>
      <input
        {...props}
        className={`ui-form-control ${className}`}
        type={password && passwordVisible ? 'text' : type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {password && (
        <button
          type="button"
          className="ui-input-toggle"
          aria-label={passwordAction}
          title={passwordAction}
          disabled={props.disabled}
          onClick={() => setPasswordVisible((visible) => !visible)}
        >
          {passwordVisible ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      )}
    </span>
  );
}

type SelectProps = Omit<ComponentProps<'select'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function Select({ value, onChange, className = '', ...props }: SelectProps) {
  return (
    <span className="ui-select-frame">
      <select
        {...props}
        className={`ui-form-control ui-select ${className}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <CaretDown aria-hidden="true" className="ui-select-chevron" size={14} />
    </span>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return htmlFor ? (
    <label className="ui-field-label" htmlFor={htmlFor}>
      {children}
    </label>
  ) : (
    <span className="ui-field-label">{children}</span>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  label,
}: {
  options: readonly { label: ReactNode; value: T }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label: string;
}) {
  return (
    <div className={`ui-segmented-control ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type CheckedInputProps = Omit<ComponentProps<'input'>, 'onChange' | 'type' | 'role' | 'defaultChecked'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Checkbox({ checked, onChange, className = '', ...props }: CheckedInputProps) {
  return (
    <input
      {...props}
      className={`ui-checkbox ${className}`}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function ToggleSwitch({ checked, onChange, className = '', ...props }: CheckedInputProps) {
  return (
    <input
      {...props}
      className={`ui-toggle-switch ${className}`}
      type="checkbox"
      role="switch"
      checked={checked}
      aria-checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function ColorInput({
  value,
  onChange,
  compact,
  className = '',
  ...props
}: Omit<InputProps, 'type' | 'defaultValue'> & { compact?: boolean }) {
  return (
    <input
      {...props}
      type="color"
      className={`ui-color-input ${className}`}
      data-size={compact ? 'compact' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function RangeInput({
  min,
  max,
  value,
  onChange,
  style,
  className = '',
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'min' | 'max' | 'onChange'> & {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const progress = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      {...props}
      type="range"
      className={`ui-range-input ${className}`}
      min={min}
      max={max}
      value={value}
      style={{ ...style, '--range-progress': `${progress}%` } as CSSProperties}
      onChange={(event) => onChange(event.target.valueAsNumber)}
    />
  );
}
