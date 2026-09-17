"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppBusyOverlay from "@/components/AppBusyOverlay";
import LanguageSettings from "@/components/LanguageSettings";
import Sheet from "@/components/ui/Sheet";
import PwaInstallSection from "@/components/PwaInstallSection";
import ProfilePrivacySection from "@/components/ProfilePrivacySection";
import WorkoutReminderSettings from "@/components/WorkoutReminderSettings";
import { clearPlayerIntake } from "@/lib/coach-intake";
import { useT } from "@/lib/i18n/I18nProvider";
import {
  pushProgressToCloud,
  pushProgressToCloudWithRetry,
  resetInitialCloudSyncCache,
} from "@/lib/progress-sync";
import type { WeekConfig } from "@/lib/planner";
import PasswordChangeSettings from "@/components/PasswordChangeSettings";
import { clearLocalUserProgress } from "@/lib/clear-local-user-data";
import { clearOfflineUserCache } from "@/lib/offline-cache";
import { resetAuthMeCache } from "@/lib/auth-session-align";
import CloudSyncSettings from "@/components/CloudSyncSettings";
import SessionSecuritySettings from "@/components/SessionSecuritySettings";

type ProfileSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  weekConfig: WeekConfig;
  onFeedback: (message: string, tone: "success" | "error" | "info") => void;
};

export default function ProfileSettingsSheet({ open, onClose, weekConfig, onFeedback }: ProfileSettingsSheetProps) {
  const t = useT();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [busyLabel, setBusyLabel] = useState(t("settings.savingData"));
  const [busySublabel, setBusySublabel] = useState(t("settings.savingDataSub"));

  return (
    <>
      <AppBusyOverlay open={loggingOut} label={busyLabel} sublabel={busySublabel} />
      <Sheet open={open} onClose={onClose} title={t("settings.title")} description={t("settings.description")}>
        <LanguageSettings />

        <CloudSyncSettings />

        <PasswordChangeSettings onFeedback={onFeedback} />

        <section className="app-card mt-4">
          <p className="section-eyebrow">{t("settings.coach")}</p>
          <h2 className="section-title mt-1">{t("settings.coachChat")}</h2>
          <p className="mt-1 text-sm text-muted">{t("settings.coachChatHint")}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={() => {
              clearPlayerIntake();
              void pushProgressToCloud({ playerIntake: "" });
              onFeedback(t("settings.coachChatResetOk"), "success");
            }}
          >
            {t("settings.coachChatReset")}
          </button>
        </section>

        <div className="mt-4">
          <WorkoutReminderSettings weekConfig={weekConfig} />
        </div>

        <section className="app-card mt-4">
          <p className="section-eyebrow">{t("settings.app")}</p>
          <h2 className="section-title mt-1">{t("settings.homeScreen")}</h2>
          <PwaInstallSection compact />
        </section>

        <div className="mt-4">
          <ProfilePrivacySection onFeedback={onFeedback} />
        </div>

        <section className="app-card mt-4">
          <p className="section-eyebrow">{t("settings.session")}</p>
          <h2 className="section-title mt-1">{t("settings.logout")}</h2>
          <p className="mt-1 text-sm text-muted">{t("settings.logoutHint")}</p>
          <SessionSecuritySettings onFeedback={onFeedback} />
          <button
            type="button"
            className="btn btn-outline btn-sm mt-3"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              setBusyLabel(t("settings.savingData"));
              setBusySublabel(t("settings.savingDataSub"));
              try {
                await pushProgressToCloudWithRetry().catch(() => undefined);
                setBusyLabel(t("settings.loggingOut"));
                setBusySublabel(t("settings.endingSession"));
                const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                if (!response.ok) throw new Error("logout_failed");
                resetAuthMeCache();
                resetInitialCloudSyncCache();
                clearLocalUserProgress();
                window.sessionStorage.clear();
                await clearOfflineUserCache();
                onClose();
                router.replace("/login");
              } catch {
                setLoggingOut(false);
                onFeedback(t("settings.logoutFailed"), "error");
              }
            }}
          >
            {loggingOut ? t("settings.loggingOut") : t("settings.logout")}
          </button>
        </section>
      </Sheet>
    </>
  );
}
