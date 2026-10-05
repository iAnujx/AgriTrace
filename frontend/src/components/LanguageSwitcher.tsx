import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "te", label: "తెలుగు" },
  { code: "mr", label: "मराठी" },
  { code: "ta", label: "தமிழ்" },
  { code: "ur", label: "اردو" },
  { code: "gu", label: "ગુજરાતી" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ml", label: "മലയാളം" },
  { code: "or", label: "ଓଡ଼ିଆ" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
  { code: "as", label: "অসমীয়া" },
];

const STORAGE_KEY = "agritrace-lang";

function setCookie(lang: string) {
  const value = lang === "en" ? "" : `/en/${lang}`;
  const expiry = lang === "en" ? "expires=Thu, 01 Jan 1970 00:00:00 GMT;" : "";
  document.cookie = `googtrans=${value};${expiry}path=/`;
  document.cookie = `googtrans=${value};${expiry}path=/;domain=${location.hostname}`;
}

function applyLanguage(lang: string) {
  const combo = document.querySelector<HTMLSelectElement>("select.goog-te-combo");
  if (combo) {
    combo.value = lang;
    combo.dispatchEvent(new Event("change"));
    return true;
  }
  return false;
}

/** Loads the translation engine once; translates every page's text into the chosen language. */
export function initTranslation() {
  const w = window as any;
  if (w.__agriTranslateLoaded) return;
  w.__agriTranslateLoaded = true;
  const host = document.createElement("div");
  host.id = "google_translate_element";
  host.style.display = "none";
  document.body.appendChild(host);
  w.googleTranslateElementInit = () => {
    const g = (w.google as any)?.translate;
    if (g) new g.TranslateElement({ pageLanguage: "en", autoDisplay: false }, "google_translate_element");
  };
  const s = document.createElement("script");
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  s.async = true;
  document.body.appendChild(s);
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "en";
    setLang(saved);
    if (saved !== "en") setCookie(saved);
    initTranslation();
  }, []);

  const choose = (code: string) => {
    setLang(code);
    localStorage.setItem(STORAGE_KEY, code);
    setCookie(code);
    document.documentElement.lang = code;
    if (code === "en" || !applyLanguage(code)) window.location.reload();
  };

  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`notranslate gap-2 ${className ?? ""}`} translate="no">
          <Languages className="h-4 w-4" />
          <span>{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="notranslate max-h-80 overflow-y-auto" translate="no">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => choose(l.code)} className={l.code === lang ? "font-semibold text-primary" : ""}>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
