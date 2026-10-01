import Link from "next/link";
import { Building2, Wrench } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const entryPoints = [
  {
    href: "/tenant",
    title: "Tenant",
    description:
      "Report a maintenance problem in your apartment and track its progress.",
    cta: "I live here",
    Icon: Wrench,
  },
  {
    href: "/staff",
    title: "Staff",
    description:
      "Triage requests, dispatch vendors and review lease terms and deadlines.",
    cta: "I work here",
    Icon: Building2,
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-12 sm:px-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          LeaseLens
        </h1>
        <p className="text-muted-foreground">
          Maintenance requests and lease answers for Capitol Residential
          Partners.
        </p>
      </header>

      <nav aria-label="Choose how you use LeaseLens">
        <ul className="grid gap-4 sm:grid-cols-2">
          {entryPoints.map(({ href, title, description, cta, Icon }) => (
            <li key={href}>
              <Card className="h-full">
                <CardHeader>
                  <Icon aria-hidden className="mb-2 size-6 text-primary" />
                  <CardTitle className="text-xl">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto">
                  <Link
                    href={href}
                    className={buttonVariants({
                      size: "lg",
                      className: "h-11 w-full text-base",
                    })}
                  >
                    {cta}
                  </Link>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
