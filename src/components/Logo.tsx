import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export function Logo({ className, size = "md", to = "/" }: { className?: string; size?: "sm" | "md" | "lg"; to?: string }) {
  const s = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8"
  return (
    <Link to={to} className={cn("flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition select-none", className)}>
      <svg className={s} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="14" fill="#0c0c0f" stroke="#1f1f2a" />
        <path d="M18 32c0-8 6-14 14-14s14 6 14 14-6 14-14 14" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4" fill="#a78bfa" />
        <path d="M12 22l8 4M52 42l-8-4M20 48l6-8M44 16l-6 8" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      </svg>
      <span className="font-semibold tracking-tight text-white text-base">
        Cloud<span className="text-[#a78bfa]">Wire</span>
      </span>
    </Link>
  )
}
