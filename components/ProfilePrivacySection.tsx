"use client";

import Link from "next/link";
import AiConsentSettings from "@/components/AiConsentSettings";
import AnalyticsConsentSettings from "@/components/AnalyticsConsentSettings";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import { downloadFullUserExport, deleteAccountAndLocalData } from "@/lib/account-data";
import { useT } from "@/lib/i18n/I18nProvider";

type ProfilePrivacySectionProps = {
  onFeedback: (message: string, tone: "success" | "error" | "info") => void;
};

export default function ProfilePrivacySection({ onFeedback }: ProfilePrivacySectionProps) {
  const appDialog = useAppDialog();
  const t = useT();

  return (
    <section className="app-card">
      <p className="section-eyebrow">{t("privacy.eyebrow")}</p>
      <h2 className="section-title mt-1">{t("privacy.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("privacy.hint")}</p>
      <AiConsentSettings onFeedback={onFeedback} />
      <AnalyticsConsentSettings onFeedback={onFeedback} />
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void downloadFullUserExport()}>
          {t("privacy.export")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-rose-600"
          onClick={async () => {
            const confirmed = await appDialog.confirm({
              title: t("privacy.deleteTitle"),
              message: t("privacy.deleteMessage"),
              confirmLabel: t("privacy.deleteContinue"),
              cancelLabel: t("privacy.deleteCancel"),
              tone: "danger",
            });
            if (!confirmed) return;

            const finalConfirm = await appDialog.confirm({
              title: t("privacy.deleteFinalTitle"),
              message: t("privacy.deleteFinalMessage"),
              confirmLabel: t("privacy.deleteConfirm"),
              cancelLabel: t("privacy.deleteCancel"),
              tone: "danger",
            });
            if (!finalConfirm) {
              onFeedback(t("privacy.deleteAborted"), "info");
              return;
            }

            const result = await deleteAccountAndLocalData();
            onFeedback(result.message, result.ok ? "success" : "error");
          }}
        >
          {t("privacy.delete")}
        </button>
      </div>
      <nav className="mt-5 flex flex-col gap-2 border-t border-[var(--surface-border)] pt-4 text-sm">
        <Link href="/datenschutz" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          {t("privacy.linkPrivacy")}
        </Link>
        <Link href="/nutzungsbedingungen" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          {t("privacy.linkTerms")}
        </Link>
        <Link href="/impressum" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          {t("privacy.linkImprint")}
        </Link>
      </nav>
    </section>
  );
}
