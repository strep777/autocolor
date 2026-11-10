import { cn } from '@/lib/utils'

export function BrandMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { box: 'h-6 w-6 rounded-md', dot: 'h-[6px] w-[6px]' },
    md: { box: 'h-9 w-9 rounded-[11px]', dot: 'h-[10px] w-[10px]' },
    lg: { box: 'h-12 w-12 rounded-[15px]', dot: 'h-[13px] w-[13px]' },
  }[size]
  return (
    <div className={cn('relative grid shrink-0 place-items-center bg-[#1D1D1F] shadow-sm', sizes.box, className)}>
      <span className={cn('absolute left-[18%] top-[21%] rounded-full bg-[#F3E9D2]', sizes.dot)} />
      <span className={cn('absolute right-[18%] top-[21%] rounded-full bg-[#0A84FF]', sizes.dot)} />
      <span className={cn('absolute bottom-[18%] left-1/2 -translate-x-1/2 rounded-full bg-[#FF9F0A]', sizes.dot)} />
    </div>
  )
}
