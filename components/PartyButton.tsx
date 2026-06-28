/** Shared party-game button + palette, used by both single-player and rooms UI. */

export const display = "font-[family-name:var(--font-display)]";

export type Variant = "yellow" | "teal" | "pink" | "purple";

export const VARIANTS: Record<Variant, string> = {
  yellow: "bg-yellow-300 text-purple-950 border-yellow-500",
  teal: "bg-teal-300 text-teal-950 border-teal-500",
  pink: "bg-pink-400 text-white border-pink-600",
  purple: "bg-fuchsia-500 text-white border-fuchsia-700",
};

export function PartyButton({
  variant = "yellow",
  className = "",
  ...props
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${display} ${VARIANTS[variant]} rounded-2xl border-b-[6px] px-6 py-4 text-xl font-bold shadow-lg transition-all duration-100 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-1 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}
