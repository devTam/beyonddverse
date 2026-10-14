import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(micros: bigint | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(micros) / 1_000_000,
  );
}
