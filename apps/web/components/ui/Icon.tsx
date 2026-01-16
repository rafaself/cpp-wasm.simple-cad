import { LucideIcon, LucideProps } from 'lucide-react';
import React from 'react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconProps extends Omit<LucideProps, 'size'> {
  icon: LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>;
  size?: IconSize;
}

const sizeMap: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export const Icon: React.FC<IconProps> = ({ icon: IconComponent, size = 'md', className, ...props }) => {
  return <IconComponent size={sizeMap[size]} className={className} {...props} />;
};
