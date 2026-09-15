"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamRole } from "@/lib/team-types";
import {
  formatTeamVideoBytes,
  isTeamImageMimeType,
  isTeamVideoMimeType,
  maxBytesForMediaKind,
  normalizeTeamMediaLink,
  TEAM_IMAGE_MAX_BYTES,
  TEAM_VIDEO_MAX_BYTES,
  type TeamMediaKind,
  type TeamVideoCategory,
  type TeamVideoView,
} from "@/lib/team-video";
import { readVideoDuration, uploadTeamVideoToSignedUrl } from "@/lib/team-video-upload";

type CategoryFilter = "all" | TeamVideoCategory;
type MediaFilter = "all" | TeamMediaKind;
type Props = { teamId: string; viewerRole: TeamRole };

const videoCache = new Map<string, TeamVideoView[]>();

const MEDIA_KIND_LABELS: Record<TeamMediaKind, string> = {
  video_upload: "Video",
  image: "Foto",
  video_link: "Link",
};

const FILE_ACCEPT: Record<"video_upload" | "image", string> = {
  video_upload: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
  image: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
};

function categoryLabel(category: TeamVideoCategory) {
  return category === "offense" ? "Offense" : "Defense";
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")} Min.`;
}

function linkHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Externer Link";
  }
}

function uploadErrorMessage(code?: string) {
  if (code === "schema_missing") return "Die Team-Videothek muss zuerst in Supabase aktiviert werden.";
  if (code === "invalid_video") return "Bitte Titel, Bereich und die ausgewählte Datei prüfen.";
  if (code === "invalid_link") return "Bitte einen vollständigen Link mit http:// oder https:// angeben.";
  if (code === "forbidden") return "Du bist kein Mitglied dieses Teams.";
  if (code === "storage_unconfigured") return "Der Medien-Speicher ist momentan nicht konfiguriert.";
  return "Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.";
}

export default function TeamVideoLibrary({ teamId, viewerRole }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cached = videoCache.get(teamId);
  const [videos, setVideos] = useState<TeamVideoView[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [mediaKind, setMediaKind] = useState<TeamMediaKind>("video_upload");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TeamVideoCategory>("offense");
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const loadVideos = useCallback(async (background = false) => {
    if (!background && !videoCache.has(teamId)) setLoading(true);
    try {
      const response = await fetch(`/api/team/videos?teamId=${encodeURIComponent(teamId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await response.json().catch(() => null)) as { videos?: TeamVideoView[]; error?: string } | null;
      if (!response.ok) throw new Error(uploadErrorMessage(json?.error));
      const nextVideos = json?.videos ?? [];
      videoCache.set(teamId, nextVideos);
      setVideos(nextVideos);
      setMessage(null);
    } catch (error) {
      if (!videoCache.has(teamId)) {
        setMessage(error instanceof Error ? error.message : "Playbook konnte nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    const nextCached = videoCache.get(teamId);
    setVideos(nextCached ?? []);
    setLoading(!nextCached);
    void loadVideos(Boolean(nextCached));
  }, [loadVideos, teamId]);

  const filteredVideos = useMemo(
    () => videos.filter((video) =>
      (categoryFilter === "all" || video.category === categoryFilter)
      && (mediaFilter === "all" || video.mediaKind === mediaFilter),
    ),
    [categoryFilter, mediaFilter, videos],
  );

  const clearFileInput = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const changeMediaKind = (nextKind: TeamMediaKind) => {
    setMediaKind(nextKind);
    setMessage(null);
    clearFileInput();
    if (nextKind !== "video_link") setLinkUrl("");
  };

  const selectFile = (nextFile: File | null) => {
    setMessage(null);
    if (!nextFile) {
      clearFileInput();
      return;
    }
    const typeMatches = mediaKind === "image"
      ? isTeamImageMimeType(nextFile.type)
      : isTeamVideoMimeType(nextFile.type);
    if (!typeMatches) {
      clearFileInput();
      setMessage(mediaKind === "image"
        ? "Unterstützt werden JPG-, PNG- und WebP-Fotos."
        : "Unterstützt werden MP4-, WebM- und MOV-Videos.");
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > maxBytesForMediaKind(mediaKind)) {
      clearFileInput();
      setMessage(mediaKind === "image"
        ? `Das Foto darf maximal ${formatTeamVideoBytes(TEAM_IMAGE_MAX_BYTES)} groß sein.`
        : `Das Video darf maximal ${formatTeamVideoBytes(TEAM_VIDEO_MAX_BYTES)} groß sein.`);
      return;
    }
    setFile(nextFile);
    if (!title.trim()) {
      setTitle(nextFile.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120));
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLinkUrl("");
    setUploadProgress(0);
    clearFileInput();
  };

  const addEntry = (video: TeamVideoView) => {
    const nextVideos = [video, ...videos];
    videoCache.set(teamId, nextVideos);
    setVideos(nextVideos);
    setCategoryFilter(video.category);
    setMediaFilter("all");
    resetForm();
  };

  const saveLink = async () => {
    const cleanTitle = title.trim();
    const link = normalizeTeamMediaLink(linkUrl);
    if (!cleanTitle || !link || uploading) {
      setMessage("Bitte einen Titel und einen vollständigen Link angeben.");
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/team/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "link",
          teamId,
          title: cleanTitle,
          description: description.trim(),
          category,
          mediaKind: "video_link",
          linkUrl: link.url,
        }),
      });
      const json = (await response.json().catch(() => null)) as { video?: TeamVideoView; error?: string } | null;
      if (!response.ok || !json?.video) throw new Error(uploadErrorMessage(json?.error));
      addEntry(json.video);
      setMessage("Link gespeichert – das gesamte Team sieht ihn jetzt im Playbook.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Link konnte nicht gespeichert werden.");
    } finally {
      setUploading(false);
    }
  };

  const uploadFile = async () => {
    const cleanTitle = title.trim();
    if (!file || !cleanTitle || uploading) {
      setMessage(mediaKind === "image"
        ? "Bitte einen Titel und ein Foto auswählen."
        : "Bitte einen Titel und ein Video auswählen.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const payload = {
        teamId,
        title: cleanTitle,
        description: description.trim(),
        category,
        mediaKind,
        mimeType: file.type,
        fileSize: file.size,
      };
      const prepareResponse = await fetch("/api/team/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "prepare", ...payload }),
      });
      const prepared = (await prepareResponse.json().catch(() => null)) as {
        storagePath?: string;
        signedUrl?: string;
        error?: string;
      } | null;
      if (!prepareResponse.ok || !prepared?.storagePath || !prepared.signedUrl) {
        throw new Error(uploadErrorMessage(prepared?.error));
      }

      const durationSeconds = mediaKind === "video_upload" ? await readVideoDuration(file) : null;
      await uploadTeamVideoToSignedUrl(prepared.signedUrl, file, setUploadProgress);
      const completeResponse = await fetch("/api/team/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "complete", storagePath: prepared.storagePath, durationSeconds, ...payload }),
      });
      const completed = (await completeResponse.json().catch(() => null)) as { video?: TeamVideoView; error?: string } | null;
      if (!completeResponse.ok || !completed?.video) throw new Error(uploadErrorMessage(completed?.error));
      addEntry(completed.video);
      setMessage(mediaKind === "image"
        ? "Foto hochgeladen – das gesamte Team kann es jetzt ansehen."
        : "Video hochgeladen – das gesamte Team kann es jetzt ansehen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = async (video: TeamVideoView) => {
    if (!video.canDelete) return;
    if (!window.confirm(`„${video.title}“ wirklich aus dem Team-Playbook löschen?`)) return;
    setMessage(null);
    const response = await fetch("/api/team/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ teamId, videoId: video.id }),
    });
    if (!response.ok) {
      setMessage("Eintrag konnte nicht gelöscht werden.");
      return;
    }
    const nextVideos = videos.filter((entry) => entry.id !== video.id);
    videoCache.set(teamId, nextVideos);
    setVideos(nextVideos);
    setMessage("Eintrag gelöscht.");
  };

  const isLinkMode = mediaKind === "video_link";
  const submitDisabled = uploading || !title.trim() || (isLinkMode ? !normalizeTeamMediaLink(linkUrl) : !file);

  return (
    <section className="mt-4 space-y-4" aria-label="Team-Playbook">
      <div className="app-card team-video-hero">
        <div className="team-workflow-header">
          <div>
            <p className="section-eyebrow">Playbook</p>
            <h2 className="section-title mt-1">Offense & Defense als Video, Foto oder Link</h2>
            <p className="mt-2 text-sm text-muted">
              Plays, Reads und Rotationen zentral teilen. Jedes Teammitglied darf Clips, Whiteboard-Fotos und Videolinks ergänzen.
            </p>
          </div>
          <span className="team-video-role-pill">{viewerRole === "coach" ? "Coach" : "Teammitglied"}</span>
        </div>

        <div className="team-video-upload mt-5">
          <fieldset className="team-video-kind">
            <legend className="input-label">Was möchtest du teilen?</legend>
            <div className="segmented segmented--brand mt-1">
              {(["video_upload", "image", "video_link"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mediaKind === value}
                  className={`segmented__btn ${mediaKind === value ? "segmented__btn--active" : ""}`}
                  onClick={() => changeMediaKind(value)}
                >
                  {MEDIA_KIND_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="team-video-upload__fields">
            <label>
              <span className="input-label">Titel *</span>
              <input
                className="input app-unified-control mt-1"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="z. B. Horns – Option gegen Switch"
              />
            </label>
            <fieldset className="team-video-category">
              <legend className="input-label">Bereich</legend>
              <div className="segmented segmented--brand mt-1">
                {(["offense", "defense"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={category === value}
                    className={`segmented__btn ${category === value ? "segmented__btn--active" : ""}`}
                    onClick={() => setCategory(value)}
                  >
                    {categoryLabel(value)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <label>
            <span className="input-label">Coaching-Hinweis (optional)</span>
            <textarea
              className="textarea mt-1"
              value={description}
              maxLength={1_000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Worauf soll das Team beim Play achten?"
              rows={3}
            />
          </label>
          {isLinkMode ? (
            <div className="team-video-file-row">
              <label className="team-video-link-field">
                <span className="input-label">Video-Link *</span>
                <input
                  className="input app-unified-control mt-1"
                  value={linkUrl}
                  maxLength={500}
                  inputMode="url"
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <small className="text-xs text-muted">YouTube, Vimeo, Hudl oder jeder andere Link. Er öffnet sich in einem neuen Tab.</small>
              </label>
              <button
                type="button"
                className="btn btn-primary team-video-upload__button"
                disabled={submitDisabled}
                onClick={() => void saveLink()}
              >
                {uploading ? "Speichert …" : "Link fürs Team speichern"}
              </button>
            </div>
          ) : (
            <div className="team-video-file-row">
              <label className="team-video-file-picker">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT[mediaKind]}
                  onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                />
                <span className="team-video-file-picker__icon" aria-hidden>＋</span>
                <span>
                  <strong>{file ? file.name : mediaKind === "image" ? "Foto auswählen" : "Video auswählen"}</strong>
                  <small>
                    {file
                      ? formatTeamVideoBytes(file.size)
                      : mediaKind === "image"
                        ? "JPG, PNG oder WebP · maximal 15 MB"
                        : "MP4, WebM oder MOV · maximal 200 MB"}
                  </small>
                </span>
              </label>
              <button
                type="button"
                className="btn btn-primary team-video-upload__button"
                disabled={submitDisabled}
                onClick={() => void uploadFile()}
              >
                {uploading ? `Upload ${uploadProgress}%` : mediaKind === "image" ? "Foto fürs Team hochladen" : "Für das Team hochladen"}
              </button>
            </div>
          )}
          {uploading && !isLinkMode ? (
            <div className="team-video-progress" role="progressbar" aria-label="Upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm text-muted" role="status">{message}</p> : null}
      </div>

      <div className="app-card">
        <div className="team-video-library-header">
          <div>
            <p className="section-eyebrow">Videothek</p>
            <h2 className="section-title mt-1">Plays für dein Team</h2>
          </div>
          <div className="team-video-filters">
            <div className="segmented" aria-label="Videobereich filtern">
              {(["all", "offense", "defense"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={categoryFilter === value}
                  className={`segmented__btn ${categoryFilter === value ? "segmented__btn--active" : ""}`}
                  onClick={() => setCategoryFilter(value)}
                >
                  {value === "all" ? "Alle" : categoryLabel(value)}
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="Medienart filtern">
              {(["all", "video_upload", "image", "video_link"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mediaFilter === value}
                  className={`segmented__btn ${mediaFilter === value ? "segmented__btn--active" : ""}`}
                  onClick={() => setMediaFilter(value)}
                >
                  {value === "all" ? "Alle Medien" : MEDIA_KIND_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? <div className="team-video-empty mt-4"><strong>Playbook wird geladen …</strong></div> : null}
        {!loading && filteredVideos.length === 0 ? (
          <div className="team-video-empty mt-4">
            <span className="team-video-empty__icon" aria-hidden>▶</span>
            <strong>Noch keine passenden Einträge</strong>
            <span>Der erste Clip, das erste Foto oder der erste Link erscheint hier für das gesamte Team.</span>
          </div>
        ) : null}
        {filteredVideos.length > 0 ? (
          <div className="team-video-grid mt-4">
            {filteredVideos.map((video) => {
              const link = video.mediaKind === "video_link" ? normalizeTeamMediaLink(video.linkUrl) : null;
              return (
                <article key={video.id} className="team-video-card">
                  <div className="team-video-card__media">
                    {video.mediaKind === "video_upload" && video.signedUrl ? (
                      <video controls preload="metadata" playsInline src={video.signedUrl} aria-label={`${video.title} abspielen`}>
                        Dein Browser unterstützt die Video-Wiedergabe nicht.
                      </video>
                    ) : null}
                    {video.mediaKind === "image" && video.signedUrl ? (
                      <a href={video.signedUrl} target="_blank" rel="noreferrer" className="team-video-card__photo">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, kein statisches Asset */}
                        <img src={video.signedUrl} alt={video.title} loading="lazy" />
                      </a>
                    ) : null}
                    {link ? (
                      <a href={link.url} target="_blank" rel="noreferrer" className="team-video-card__link" aria-label={`${video.title} in neuem Tab öffnen`}>
                        {link.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element -- externes Thumbnail ohne Next-Loader */
                          <img src={link.thumbnailUrl} alt="" loading="lazy" />
                        ) : null}
                        <span className="team-video-card__link-badge">▶ {linkHostLabel(link.url)}</span>
                      </a>
                    ) : null}
                    {!video.signedUrl && !link ? (
                      <div className="team-video-card__unavailable">Medien-Link konnte nicht geladen werden.</div>
                    ) : null}
                    <span className={`team-video-category-pill team-video-category-pill--${video.category}`}>
                      {categoryLabel(video.category)}
                    </span>
                  </div>
                  <div className="team-video-card__body">
                    <div className="team-video-card__title-row">
                      <h3>{video.title}</h3>
                      {video.canDelete ? (
                        <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deleteVideo(video)}>
                          Löschen
                        </button>
                      ) : null}
                    </div>
                    {video.description ? <p>{video.description}</p> : null}
                    <div className="team-video-card__meta">
                      <span>{MEDIA_KIND_LABELS[video.mediaKind]}</span>
                      <span>Von {video.uploaderName}</span>
                      <span>{new Date(video.createdAt).toLocaleDateString("de-DE")}</span>
                      {formatDuration(video.durationSeconds) ? <span>{formatDuration(video.durationSeconds)}</span> : null}
                      {video.fileSize ? <span>{formatTeamVideoBytes(video.fileSize)}</span> : null}
                      {link ? <span>{linkHostLabel(link.url)}</span> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
