import Link from 'next/link';
import { Wine, Shield, Brain, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mx-auto max-w-lg space-y-8">
          {/* Logo */}
          <div className="space-y-4">
            <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-primary/10 shadow-lg">
              <Wine className="size-10 text-primary" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter">SOBR</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Real-time drink tracking, BAC monitoring, and an AI buddy that helps you get home safe.
            </p>
          </div>

          {/* CTA */}
          <Link
            href="/customer"
            className="group inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
          >
            Get Started
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 px-6 py-16">
        <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-3">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Wine className="size-7 text-primary" />
            </div>
            <h3 className="font-semibold">Live Tracking</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your bartender logs every drink. You see it instantly on your phone.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="size-7 text-primary" />
            </div>
            <h3 className="font-semibold">BAC Monitoring</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Real-time blood alcohol estimate using the Widmark formula. Know where you stand.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Brain className="size-7 text-primary" />
            </div>
            <h3 className="font-semibold">Meet Breathy</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your AI buddy checks in before you close your tab. Personalized advice to get home safe.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">SOBR</span>
          <span className="text-xs text-muted-foreground">Drink smart. Get home safe.</span>
        </div>
      </footer>
    </main>
  );
}
