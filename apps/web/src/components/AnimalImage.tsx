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
  // icon은 얼굴만 잘라 둔 그림이라 그대로 채우면 된다.
  return (
    <span className={`block overflow-hidden rounded-full ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variant === "icon" ? info.icon : info.image}
        alt={info.name}
        draggable={false}
        className="h-full w-full object-cover [image-rendering:pixelated]"
      />
    </span>
  );
}
