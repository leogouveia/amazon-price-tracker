type BrandLogoProps = {
  size?: "sm" | "md";
  showTitle?: boolean;
  className?: string;
};

const imageSizes = {
  sm: "h-9 max-w-[200px]",
  md: "h-16 max-w-[240px]",
};

export function BrandLogo({
  size = "sm",
  showTitle = true,
  className = "",
}: BrandLogoProps) {
  return (
    <a
      href="/"
      className={`flex items-center gap-3 ${className}`}
    >
      <img
        src="/logo_amazon_tracker.png"
        alt="Amazon Price Tracker"
        className={`w-auto object-contain ${imageSizes[size]}`}
      />
      {showTitle && (
        <span className="hidden text-lg font-bold sm:inline">
          Amazon Price Tracker
        </span>
      )}
    </a>
  );
}
