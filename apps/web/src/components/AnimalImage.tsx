import { getAnimal } from "../lib/animals";

export default function AnimalImage({
  animal,
  className = "size-10",
  variant = "icon",
}: {
  animal: string;
  className?: string;
  variant?: "icon" | "full";
}) {
  const info = getAnimal(animal);
  if (!info) return <span className="text-2xl">{animal}</span>;
  const scale = variant === "icon" ? info.iconScale : 1;
  const posY = variant === "icon" ? info.iconY : 50;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <span className={`block overflow-hidden rounded-full ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variant === "icon" ? info.icon : info.image}
        alt={info.name}
        draggable={false}
        className="h-full w-full object-cover [image-rendering:pixelated]"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${variant === "icon" ? info.iconX : 50}% ${posY}%`,
        }}
      />
    </span>
  );
}