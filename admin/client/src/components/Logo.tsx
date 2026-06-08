export function Logo({ className = "", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/jbh_profile.png"
        alt="Juss Beautiful Hair monogram"
        width={42}
        height={42}
        className="shrink-0 h-10 w-10 rounded-full object-cover ring-1 ring-primary/10"
      />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-base font-semibold tracking-wide">
            Juss Beautiful Hair
          </span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-gold mt-0.5">
            Lawless &amp; Flawless
          </span>
        </span>
      )}
    </span>
  );
}
