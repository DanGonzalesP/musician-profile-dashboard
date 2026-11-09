"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { USERNAME_PATTERN } from "@/lib/username"
import { useLocale } from "@/components/locale-provider"
import MarqueeText from "./MarqueeText"

export default function AuthorProfileLink({ name, username, className = "" }: { name: string; username?: string; className?: string }) {
  const { t } = useLocale()
  if (!username || !USERNAME_PATTERN.test(username)) {
    return <MarqueeText text={name} className={className} />
  }
  return <Link
    href={`/${encodeURIComponent(username)}`}
    prefetch={false}
    aria-label={`${t("feed_author_profile")} ${name}`}
    className="flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-md px-1 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  >
    <MarqueeText text={name} className={className} />
    <ArrowUpRight aria-hidden className="size-4 shrink-0 text-primary" />
  </Link>
}
