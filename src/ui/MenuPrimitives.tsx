import { CaretDown } from '@phosphor-icons/react';
import { type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';

type ButtonProps = ComponentProps<'button'>;

export function MenuTrigger({
  icon,
  label,
  valueHint,
  children,
  className = '',
  ...props
}: ButtonProps & {
  icon: ReactNode;
  label: string;
  valueHint?: string;
}) {
  return (
    <button
      type="button"
      title={valueHint ? `${label} · ${valueHint}` : label}
      className={`ui-menu-trigger ${className}`}
      {...props}
    >
      <span className="ui-menu-trigger-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ui-menu-trigger-caption">
        {valueHint ? (
          <>
            <span className="sr-only">{label}</span>
            <strong>{valueHint}</strong>
          </>
        ) : (
          <strong>{label}</strong>
        )}
      </span>
      {props['aria-expanded'] !== undefined && (
        <CaretDown size={12} className="ui-menu-trigger-chevron" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function MenuGroup({
  label,
  children,
  className = '',
  bodyClassName = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  bodyClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`ui-menu-group menu-group ${className}`} {...props}>
      <div className="ui-menu-group-label" aria-hidden="true">
        {label}
      </div>
      <div className={`ui-menu-group-body ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export function MenuItem({ className = '', tone, ...props }: ButtonProps & { tone?: 'danger' }) {
  return <button type="button" className={`ui-menu-item ${className}`} data-tone={tone} {...props} />;
}

export function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  renderIcon,
  columns,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  renderIcon?: (value: string) => ReactNode;
  columns?: 4;
}) {
  return (
    <MenuGroup label={label}>
      <div className="ui-choice-group" data-columns={columns}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {renderIcon && (
              <span className="ui-choice-icon" aria-hidden="true">
                {renderIcon(option.value)}
              </span>
            )}
            {option.label}
          </button>
        ))}
      </div>
    </MenuGroup>
  );
}

export function ControlField({
  label,
  children,
  inline = false,
}: {
  label: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label className="ui-control-field" data-inline={inline || undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SearchInput({
  icon,
  className = '',
  ...props
}: ComponentProps<'input'> & { icon: ReactNode }) {
  return (
    <label className={`ui-menu-search ${className}`}>
      <span aria-hidden="true">{icon}</span>
      <input type="search" className="ui-search-input" {...props} />
    </label>
  );
}
