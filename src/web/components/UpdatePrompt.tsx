import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 3500);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 fade-in">
      <div className="panel flex items-center gap-3 px-4 py-3 text-sm">
        {needRefresh ? (
          <>
            <RefreshCw size={16} className="gold" />
            <span>{t("pwa.update")}</span>
            <button
              type="button"
              className="btn btn-sm btn-gold"
              onClick={() => void updateServiceWorker(true)}
            >
              {t("pwa.updateBtn")}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("pwa.later")}
              onClick={() => setNeedRefresh(false)}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="green">●</span>
            <span>{t("pwa.offlineReady")}</span>
          </>
        )}
      </div>
    </div>
  );
}
