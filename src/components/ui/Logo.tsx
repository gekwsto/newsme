interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  firstPartClassName?: string;
  secondPartClassName?: string;
}

export default function Logo({
  size = 'md',
  firstPartClassName = 'text-red-500',
  secondPartClassName = 'text-white',
}: LogoProps) {
  const sizeClass = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <span className={`font-black ${sizeClass} tracking-widest`}>
      <span className={firstPartClassName}>Newsme</span>
      <span className={secondPartClassName}>.gr</span>
    </span>
  );
}
