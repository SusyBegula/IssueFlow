import { UserRound } from "lucide-react";
import type { Profile } from "@/lib/types";

export function Avatar({
  person,
  small = false,
}: {
  person?: Profile;
  small?: boolean;
}) {
  const initials = person?.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={person?.name || "Unassigned"}
      className={`avatar ${person?.color || "neutral"} ${small ? "small" : ""}`}
    >
      {person?.avatar_url ? (
        // The API returns a resized local data URL; no image proxy is needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt={person.name} />
      ) : person ? (
        initials
      ) : (
        <UserRound size={13} />
      )}
    </span>
  );
}
