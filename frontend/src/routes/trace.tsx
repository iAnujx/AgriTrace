import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sprout, MapPin, Flag, Truck } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import PublicTrace from "@/views/PublicTrace";

type Data = {
  c: string; k: string; q: number; u: string; p: number; n: string; r: string;
  o: string; h: string; s: { place: string; handler: string; date: string }[]; d: string; t: string;
};

export const Route = createFileRoute("/trace")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Crop Journey — AgriTrace" },
      { name: "description", content: "See where this produce was grown and every place it travelled." },
      { property: "og:title", content: "Crop Journey — AgriTrace" },
      { property: "og:description", content: "See where this produce was grown and every place it travelled." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraceEntry,
});

/** new QR links carry ?f= (read from the blockchain); older marketplace links carry ?d= (data inside the link) */
function TraceEntry() {
  return new URLSearchParams(window.location.search).has("f") ? <PublicTrace /> : <LegacyTrace />;
}

function LegacyTrace() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("d") ?? "";
      setData(JSON.parse(decodeURIComponent(escape(atob(raw)))));
    } catch { setError(true); }
  }, []);

  if (error) return <div className="min-h-screen grid place-items-center p-6 text-center"><p>This QR code could not be read. <Link to="/" className="text-primary underline">Go home</Link></p></div>;
  if (!data) return null;

  const steps = [
    { icon: Sprout, place: data.o || "Origin farm", who: `${data.n} (grower)`, date: data.h },
    ...data.s.map((x) => ({ icon: Truck, place: x.place, who: x.handler, date: x.date })),
    ...(data.d ? [{ icon: Flag, place: data.d, who: "Final destination", date: "" }] : []),
  ];

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Sprout className="h-5 w-5" /></span>AgriTrace</div>
          <LanguageSwitcher />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{data.k}</p>
          <h1 className="text-3xl font-bold">{data.c}</h1>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground">Quantity</p><p className="font-semibold">{data.q} {data.u}</p></div>
            <div><p className="text-muted-foreground">Price</p><p className="font-semibold">₹{data.p}/{data.u}</p></div>
            <div><p className="text-muted-foreground">Listed by</p><p className="font-semibold capitalize">{data.r}</p></div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg">Journey</h2>
          <ol className="relative space-y-6 border-l-2 border-primary/30 pl-6">
            {steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"><s.icon className="h-4 w-4" /></span>
                <p className="font-semibold flex items-center gap-1"><MapPin className="h-4 w-4 text-primary" />{s.place || "—"}</p>
                <p className="text-sm text-muted-foreground">{s.who}{s.date && ` · ${new Date(s.date).toLocaleDateString("en-IN")}`}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
