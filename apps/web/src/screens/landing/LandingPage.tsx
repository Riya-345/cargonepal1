// ============================================================
// CargoNepal — Landing Page (spec §53, §54)
// ============================================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { Button } from "@/components/ui";
import { BRAND, SERVICE_CITIES, PARCEL_CATEGORIES } from "@/core/constants";
import { cn } from "@/core/utils";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#customers", label: "For Customers" },
  { href: "#riders", label: "For Riders" },
  { href: "#business", label: "For Business" },
  { href: "#pricing", label: "Pricing" },
  { href: "#service-areas", label: "Service Areas" },
  { href: "#faq", label: "FAQ" },
];

const STEPS = [
  { n: "1", icon: "📍", title: "Set pickup & drop", text: "Drop a pin on the map or search any address in your city. Add parcel details in seconds." },
  { n: "2", icon: "🛵", title: "We find the nearest rider", text: "Our matching engine searches online riders within 1km, then 2km, then 5km and dispatches instantly." },
  { n: "3", icon: "🗺️", title: "Track live on the map", text: "Watch your rider move in real time with ETA, route, and status updates at every step." },
  { n: "4", icon: "✅", title: "Delivered & verified", text: "QR + photo proof of delivery, OTP for high-value parcels, and pay digitally or on delivery." },
];

const WHY = [
  { icon: "⚡", title: "Instant matching", text: "Nearest available rider assigned automatically — no waiting on hold." },
  { icon: "🛡️", title: "Parcel-first & secure", text: "QR verification, proof of delivery, and insured handling for fragile items." },
  { icon: "💳", title: "Flexible payments", text: "Khalti, eSewa, Fonepay, card, or Cash on Delivery. Server-verified, always." },
  { icon: "📊", title: "Live tracking", text: "Real-time GPS, ETA, and full status history from pickup to doorstep." },
  { icon: "🇳🇵", title: "Built for Nepal", text: "Local cities, local payments, local riders. Designed around how Nepal delivers." },
  { icon: "🏢", title: "Business ready", text: "Bulk orders, monthly billing, COD reports, and API access for sellers." },
];

const FAQS = [
  { q: "How fast can I book a courier?", a: "Booking takes under a minute. Once confirmed, we search for the nearest online rider in expanding rings (1km → 2km → 5km) and usually assign within moments." },
  { q: "What can I send?", a: "Documents, food, clothing, electronics, medicine, small packages, fragile items, and more. Add a declared value and we apply extra verification for high-value parcels." },
  { q: "How do I pay?", a: "Pay with Khalti, eSewa, Fonepay, card, or Cash on Delivery. Digital payments are verified server-side; COD is collected by the rider and settled transparently." },
  { q: "Can I track my parcel live?", a: "Yes. Every active delivery shows the rider's live location, route, ETA, distance remaining, and a full status timeline." },
  { q: "Which cities do you serve?", a: `${SERVICE_CITIES.join(", ")}. We're expanding — more cities are added from the admin console without app changes.` },
  { q: "How do I become a rider?", a: "Register with your ID, driving license, and vehicle details. Once an admin approves your documents, go online to start receiving delivery requests and earning." },
  { q: "Is my parcel safe?", a: "Riders verify pickup and delivery with QR codes, capture photo proof, and high-value parcels require an OTP. Fragile handling is available at checkout." },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="cn-container flex items-center justify-between py-3">
          <Link to="/"><Logo /></Link>
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-ink-600 transition hover:text-brand-600">{l.label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/login" className="text-sm font-semibold text-ink-700 hover:text-brand-600">Sign in</Link>
            <Link to="/signup"><Button size="sm">Send a Parcel</Button></Link>
          </div>
          <button className="text-2xl text-ink-700 lg:hidden" onClick={() => setMobileNav((v) => !v)} aria-label="Menu">☰</button>
        </div>
        {mobileNav && (
          <div className="border-t border-ink-100 bg-white lg:hidden">
            <div className="cn-container flex flex-col gap-1 py-3">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMobileNav(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">{l.label}</a>
              ))}
              <div className="mt-2 flex gap-2 px-3">
                <Link to="/login" className="flex-1"><Button variant="outline" className="w-full">Sign in</Button></Link>
                <Link to="/signup" className="flex-1"><Button className="w-full">Send a Parcel</Button></Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="cn-container relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="text-white">
            <span className="cn-badge bg-white/15 text-white/90 backdrop-blur">🇳🇵 Nepal's parcel-first courier platform</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
              {BRAND.tagline.split(". ").map((part, i) => (
                <span key={i} className={cn("block", i === 1 && "text-accent-300")}>{part}{i < 2 ? "." : ""}</span>
              ))}
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/80">{BRAND.subheading} Book a bike courier in seconds, track your parcel live, and pay your way.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup"><Button size="lg" className="bg-white !text-brand-700 hover:bg-ink-50">Send a Parcel</Button></Link>
              <Link to="/rider/join"><Button size="lg" variant="accent">Become a Rider</Button></Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-8">
              {[{ k: "5", v: "Cities live" }, { k: "<60s", v: "Avg. rider match" }, { k: "4", v: "Payment methods" }, { k: "24/7", v: "Live tracking" }].map((s) => (
                <div key={s.v}><p className="text-2xl font-extrabold">{s.k}</p><p className="text-sm text-white/70">{s.v}</p></div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="cn-card overflow-hidden shadow-pop">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" /><span className="text-sm font-semibold">Live tracking</span></div>
                <span className="cn-badge bg-brand-50 text-brand-700">CN-20261008-4F2A</span>
              </div>
              <div className="relative h-64 bg-gradient-to-br from-ink-100 to-ink-200">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 260" fill="none">
                  <path d="M40 200 C120 180, 160 90, 250 110 S360 70, 370 50" stroke="#1f42eb" strokeWidth="4" strokeDasharray="8 6" strokeLinecap="round" />
                  <circle cx="40" cy="200" r="9" fill="#1f42eb" />
                  <circle cx="370" cy="50" r="9" fill="#f83232" />
                </svg>
                <div className="absolute left-[52%] top-[38%] flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                  <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-40" />🛵
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between text-sm"><span className="text-ink-500">Rider arriving</span><span className="font-semibold text-brand-600">~6 min</span></div>
                <div className="h-2 rounded-full bg-ink-100"><div className="h-2 w-2/3 rounded-full bg-brand-500" /></div>
                <div className="flex justify-between text-xs text-ink-400"><span>Picked up</span><span>On the way</span><span>Delivered</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Parcel categories strip */}
      <section className="border-b border-ink-100 bg-ink-50 py-6">
        <div className="cn-container">
          <p className="text-center text-sm font-medium text-ink-500">Delivering everything Nepal sends</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {PARCEL_CATEGORIES.map((c) => (
              <span key={c.value} className="cn-badge bg-white border border-ink-100 text-ink-700 shadow-sm"><span>{c.icon}</span>{c.label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <Section id="how-it-works" eyebrow="How it works" title="From booking to doorstep in four steps">
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="cn-card relative p-6">
              <span className="absolute right-5 top-4 text-5xl font-extrabold text-ink-100">{s.n}</span>
              <div className="text-3xl">{s.icon}</div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* For customers */}
      <Section id="customers" eyebrow="For Customers" title="Send parcels without the hassle" alt>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          <ul className="space-y-4">
            {[
              "Book in under a minute with map-based pickup & drop-off",
              "Transparent, distance-based fare estimate before you confirm",
              "Live GPS tracking with ETA and full status history",
              "Pay with Khalti, eSewa, Fonepay, card, or Cash on Delivery",
              "QR-verified pickup and photo proof of delivery",
              "Saved addresses, order history, and 24/7 support",
            ].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 text-green-500">✓</span><span className="text-ink-700">{t}</span></li>
            ))}
          </ul>
          <div className="cn-card p-6">
            <h3 className="font-bold">Perfect for</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {["Individuals", "Online sellers", "Instagram sellers", "TikTok sellers", "Daraz sellers", "Small businesses", "Restaurants", "Pharmacies", "Offices", "E-commerce"].map((x) => (
                <div key={x} className="rounded-xl bg-ink-50 px-3 py-2 text-ink-700">{x}</div>
              ))}
            </div>
            <Link to="/signup" className="mt-6 block"><Button className="w-full">Send your first parcel</Button></Link>
          </div>
        </div>
      </Section>

      {/* For riders */}
      <Section id="riders" eyebrow="For Riders" title="Turn your bike into steady income">
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          <div className="cn-card bg-ink-950 p-8 text-white">
            <p className="text-sm text-white/60">Today's earnings</p>
            <p className="mt-1 text-4xl font-extrabold">NPR 2,340</p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              {[{ k: "14", v: "Deliveries" }, { k: "4.9★", v: "Rating" }, { k: "NPR 470", v: "COD held" }].map((s) => (
                <div key={s.v} className="rounded-xl bg-white/10 p-3"><p className="text-lg font-bold">{s.k}</p><p className="text-xs text-white/60">{s.v}</p></div>
              ))}
            </div>
            <p className="mt-6 text-sm text-white/70">Go online, accept requests near you, and get paid per delivery. Transparent commission, weekly payouts.</p>
          </div>
          <ul className="space-y-4">
            {[
              "Flexible: go online whenever you want",
              "Smart requests matched to your location",
              "Clear earnings with configurable commission",
              "In-app navigation to pickup and drop-off",
              "QR pickup and photo proof keep you protected",
              "Fast admin verification to get you rolling",
            ].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 text-green-500">✓</span><span className="text-ink-700">{t}</span></li>
            ))}
          </ul>
        </div>
        <div className="mt-8 text-center"><Link to="/rider/join"><Button variant="accent" size="lg">Become a Rider</Button></Link></div>
      </Section>

      {/* For business */}
      <Section id="business" eyebrow="For Business" title="Built to scale with your store" alt>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "📦", t: "Bulk & multi-drop", d: "Send many parcels at once with saved addresses and templates." },
            { icon: "🧾", t: "Monthly billing", d: "Consolidated invoices and COD reconciliation for your accounts." },
            { icon: "📊", t: "Delivery & COD reports", d: "Export CSV/Excel/PDF reports on demand." },
            { icon: "🔌", t: "API integration", d: "Plug CargoNepal into your store or ERP with our API." },
            { icon: "🏷️", t: "Volume pricing", d: "Negotiated rates and priority matching for high-volume sellers." },
            { icon: "🤝", t: "Dedicated support", d: "A business account manager and priority support queue." },
          ].map((f) => (
            <div key={f.t} className="cn-card p-6"><div className="text-3xl">{f.icon}</div><h3 className="mt-3 font-bold">{f.t}</h3><p className="mt-1 text-sm text-ink-500">{f.d}</p></div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" eyebrow="Pricing" title="Simple, distance-based fares">
        <div className="mx-auto mt-10 max-w-3xl cn-card p-8">
          <div className="grid gap-6 sm:grid-cols-3 text-center">
            {[{ k: "NPR 50", v: "Base fare" }, { k: "per km", v: "Distance rate" }, { k: "per kg", v: "Weight rate" }].map((x) => (
              <div key={x.v}><p className="text-2xl font-extrabold text-brand-600">{x.k}</p><p className="text-sm text-ink-500">{x.v}</p></div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-500">
            Total = Base + Distance + Weight + Services (priority, fragile, waiting) + COD fee − Discount.
            Minimum fare applies. All rates are configurable and shown to you before you confirm.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["COD fee for cash collection", "Priority & express options", "Fragile handling surcharge", "Peak-hour pricing (transparent)"].map((x) => (
              <div key={x} className="flex items-center gap-2 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700"><span className="text-brand-500">●</span>{x}</div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-ink-400">Final fare is calculated server-side and shown at checkout. No hidden charges.</p>
        </div>
      </Section>

      {/* Why CargoNepal */}
      <Section id="why" eyebrow="Why CargoNepal" title="A courier platform you can trust" alt>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((f) => (
            <div key={f.title} className="cn-card p-6"><div className="text-3xl">{f.icon}</div><h3 className="mt-3 font-bold">{f.title}</h3><p className="mt-1 text-sm text-ink-500">{f.text}</p></div>
          ))}
        </div>
      </Section>

      {/* Service areas */}
      <Section id="service-areas" eyebrow="Service Areas" title="Live across Nepal's key cities">
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {SERVICE_CITIES.map((c) => (
            <span key={c} className="cn-badge bg-brand-50 text-brand-700 border border-brand-100 px-4 py-2 text-sm">📍 {c}</span>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink-500">Expanding soon. New cities are enabled from the admin console without any app update.</p>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Frequently asked questions" alt>
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {FAQS.map((f, i) => (
            <div key={f.q} className="cn-card overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-5 py-4 text-left">
                <span className="font-semibold">{f.q}</span>
                <span className={cn("text-brand-600 transition-transform", openFaq === i && "rotate-45")}>＋</span>
              </button>
              {openFaq === i && <div className="border-t border-ink-100 px-5 py-4 text-sm text-ink-600 animate-fade-in">{f.a}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Download / CTA */}
      <Section id="download" eyebrow="Get started" title="Ready to send a parcel?">
        <div className="mx-auto mt-8 max-w-2xl cn-card bg-gradient-to-br from-brand-700 to-brand-900 p-10 text-center text-white">
          <h3 className="text-2xl font-extrabold">Start delivering with CargoNepal today</h3>
          <p className="mt-2 text-white/80">Create a free account, book your first courier, and track it live.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/signup"><Button size="lg" className="bg-white !text-brand-700 hover:bg-ink-50">Send a Parcel</Button></Link>
            <Link to="/rider/join"><Button size="lg" variant="accent">Become a Rider</Button></Link>
          </div>
          <p className="mt-6 text-xs text-white/60">Mobile apps coming soon. The web app works great on any device.</p>
        </div>
      </Section>

      {/* Contact */}
      <Section id="contact" eyebrow="Contact" title="Get in touch" alt>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[{ icon: "📧", t: "Email", d: BRAND.supportEmail }, { icon: "📞", t: "Phone", d: BRAND.supportPhone }, { icon: "📍", t: "Office", d: "Kathmandu, Nepal" }].map((c) => (
            <div key={c.t} className="cn-card p-6 text-center"><div className="text-3xl">{c.icon}</div><h3 className="mt-2 font-bold">{c.t}</h3><p className="mt-1 text-sm text-ink-500">{c.d}</p></div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-ink-950 text-white">
        <div className="cn-container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo light />
            <p className="mt-3 text-sm text-white/60">Nepal's parcel-first instant courier platform. Fast. Safe. Parcel First.</p>
          </div>
          <div>
            <h4 className="font-semibold">Platform</h4>
            <ul className="mt-3 space-y-2 text-sm text-white/60">
              <li><Link to="/signup" className="hover:text-white">Send a parcel</Link></li>
              <li><Link to="/rider/join" className="hover:text-white">Become a rider</Link></li>
              <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-white/60">
              <li><a href="#business" className="hover:text-white">For business</a></li>
              <li><a href="#service-areas" className="hover:text-white">Service areas</a></li>
              <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              <li><a href="#contact" className="hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Legal</h4>
            <ul className="mt-3 space-y-2 text-sm text-white/60">
              <li><a href="#" className="hover:text-white">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="cn-container flex flex-col items-center justify-between gap-2 py-5 text-xs text-white/50 sm:flex-row">
            <span>© {new Date().getFullYear()} CargoNepal. All rights reserved.</span>
            <span>Made in Nepal 🇳🇵</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, children, alt }: { id: string; eyebrow: string; title: string; children: React.ReactNode; alt?: boolean }) {
  return (
    <section id={id} className={cn("py-16 lg:py-20", alt && "bg-ink-50")}>
      <div className="cn-container">
        <div className="text-center">
          <span className="cn-badge bg-brand-50 text-brand-700">{eyebrow}</span>
          <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}
