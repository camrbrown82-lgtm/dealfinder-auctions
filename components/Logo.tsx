import Image from "next/image";

export function Logo({
  className = "h-10 w-10 object-contain sm:h-12 sm:w-12",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/logo.webp"
      alt=""
      width={96}
      height={96}
      className={className}
      priority
    />
  );
}
