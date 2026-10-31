"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartNoAxesColumnIncreasing, Dumbbell, House, SlidersHorizontal } from "lucide-react";

const TABS = [
  { href: "/", label: "Aujourd’hui", icon: House },
  { href: "/workout", label: "Séance", icon: Dumbbell },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/progress", label: "Progrès", icon: ChartNoAxesColumnIncreasing },
  { href: "/settings", label: "Réglages", icon: SlidersHorizontal },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Bottom tab bar on phones, side bar from 1024 px. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:inset-y-0 lg:left-0 lg:right-auto lg:w-60 lg:border-r lg:border-t-0 lg:bg-card lg:pb-0 lg:pt-10"
    >
      <p className="hidden px-6 pb-6 text-[13px] font-semibold uppercase tracking-wide text-accent lg:block">
        My Training Sheet
      </p>
      <ul className="grid grid-cols-5 lg:flex lg:flex-col lg:gap-1 lg:px-3">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-[15px] ${
                  active ? "text-accent lg:bg-accent-soft" : "text-text-muted hover:text-text"
                }`}
              >
                <Icon aria-hidden size={24} strokeWidth={1.8} className="lg:size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
