import { Icon } from '@/shared/ui/icons';

export function RoleIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  return <Icon name={icon} size={size} />;
}
