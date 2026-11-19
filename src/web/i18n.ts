import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en";
import ru from "./locales/ru";

export type Lang = "ru" | "en";

export const LANG_KEY = "pf2e.lang";

export function detectLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "ru" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: detectLang(),
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
