import Link from 'next/link';
import { Category } from '@/types';
import { cn } from '@/lib/utils';
import { getDisplayCategory } from '@/config/categories';

interface CategoryBadgeProps {
  category: Category;
  size?: 'sm' | 'md';
  linkable?: boolean;
}

export default function CategoryBadge({
  category,
  size = 'md',
  linkable = true,
}: CategoryBadgeProps) {
  const display = getDisplayCategory(category.slug) ?? category;
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  const classes = cn(
    'inline-flex items-center font-semibold rounded-full border tracking-wide',
    sizeClass
  );
  const style = {
    color: display.color,
    backgroundColor: `${display.color}20`,
    borderColor: `${display.color}50`,
  };

  if (linkable) {
    return (
      <Link href={`/category/${display.slug}`} className={cn(classes, 'hover:opacity-80 transition-opacity')} style={style}>
        {display.name}
      </Link>
    );
  }

  return <span className={classes} style={style}>{display.name}</span>;
}
