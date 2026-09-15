"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamRole } from "@/lib/team-types";
import {
  formatTeamVideoBytes,
  isTeamVideoMimeType,
  TEAM_VIDEO_MAX_BYTES,
  type TeamVideoCategory,
  type TeamVideoView,
} from "@/lib/team-video";
import { readVideoDuration, uploadTeamVideoToSignedUrl } from "@/lib/team-video-upload";

type VideoFilter = "all" | TeamVideoCategory;
type Props = { teamId: string; viewerRole: TeamRole };

const videoCache = new Map<string, TeamVideoView[]>();

function categoryLabel(category: TeamVideoCategory) {
  return category === "offense" ? "Offense" : "Defense";
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")} Min.`;
}

function uploadErrorMessage(code?: string) {
  if (code === "schema_missing") return "Die Team-Videothek muss zuerst in Supabase aktiviert werden.";
  if (code === "invalid_video") return "Bitte Titel, Bereich und eine unterstützte Videodatei prüfen.";
  if (code === "forbidden") return "Du bist kein Mitglied dieses Teams.";
  if (code === "storage_unconfigured") return "Der Video-Speicher ist momentan nicht konfiguriert.";
  return "Das Video konnte nicht gespeichert werden. Bitte erneut versuchen.";
}

export default function TeamVideoLibrary({ teamId, viewerRole }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cached = videoCache.get(teamId);
  const [videos, setVideos] = useState<TeamVideoView[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [filter, setFilter] = useState<VideoFilter>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TeamVideoCategory>("offense");
  const [file, setFile] = useState<File | null>(null);
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
        setMessage(error instanceof Error ? error.message : "Videos konnten nicht geladen werden.");
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
    () => filter === "all" ? videos : videos.filter((video) => video.category === filter),
    [filter, videos],
  );

  const selectFile = (nextFile: File | null) => {
    setMessage(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!isTeamVideoMimeType(nextFile.type)) {
      setFile(null);
      setMessage("Unterstützt werden MP4-, WebM- und MOV-Videos.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > TEAM_VIDEO_MAX_BYTES) {
      setFile(null);
      setMessage("Das Video darf maximal 200 MB groß sein.");
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    setFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadVideo = async () => {
    const cleanTitle = title.trim();
    if (!file || !cleanTitle || uploading) {
      setMessage("Bitte einen Titel und ein Video auswählen.");
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

      const durationSeconds = await readVideoDuration(file);
      await uploadTeamVideoToSignedUrl(prepared.signedUrl, file, setUploadProgress);
      const completeResponse = await fetch("/api/team/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "complete", storagePath: prepared.storagePath, durationSeconds, ...payload }),
      });
      const completed = (await completeResponse.json().catch(() => null)) as { video?: TeamVideoView; error?: string } | null;
      if (!completeResponse.ok || !completed?.video) throw new Error(uploadErrorMessage(completed?.error));
      const nextVideos = [completed.video, ...videos];
      videoCache.set(teamId, nextVideos);
      setVideos(nextVideos);
      setFilter(category);
      resetForm();
      setMessage("Video hochgeladen – das gesamte Team kann es jetzt ansehen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video-Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = async (video: TeamVideoView) => {
    if (!video.canDelete) return;
    if (!window.confirm(`„${video.title}“ wirklich aus der Team-Videothek löschen?`)) return;
    setMessage(null);
    const response = await fetch("/api/team/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ teamId, videoId: video.id }),
    });
    if (!response.ok) {
      setMessage("Video konnte nicht gelöscht werden.");
      return;
    }
    const nextVideos = videos.filter((entry) => entry.id !== video.id);
    videoCache.set(teamId, nextVideos);
    setVideos(nextVideos);
    setMessage("Video gelöscht.");
  };

  return (
    <section className="mt-4 space-y-4" aria-label="Team-Videothek">
      <div className="app-card team-video-hero">
        <div className="team-workflow-header">
          <div>
            <p className="section-eyebrow">Playbook</p>
            <h2 className="section-title mt-1">Offense & Defense als Video</h2>
            <p className="mt-2 text-sm text-muted">
              Plays, Reads und Rotationen zentral teilen. Jedes Teammitglied darf Clips hochladen.
            </p>
          </div>
          <span className="team-video-role-pill">{viewerRole === "coach" ? "Coach" : "Teammitglied"}</span>
        </div>

        <div className="team-video-upload mt-5">
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
          <div className="team-video-file-row">
            <label className="team-video-file-picker">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
              <span className="team-video-file-picker__icon" aria-hidden>＋</span>
              <span><strong>{file ? file.name : "Video auswählen"}</strong><small>{file ? formatTeamVideoBytes(file.size) : "MP4, WebM oder MOV · maximal 200 MB"}</small></span>
            </label>
            <button
              type="button"
              className="btn btn-primary team-video-upload__button"
              disabled={!file || !title.trim() || uploading}
              onClick={() => void uploadVideo()}
            >
              {uploading ? `Upload ${uploadProgress}%` : "Für das Team hochladen"}
            </button>
          </div>
          {uploading ? (
            <div className="team-video-progress" role="progressbar" aria-label="Video-Upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
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
          <div className="segmented" aria-label="Videobereich filtern">
            {(["all", "offense", "defense"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={`segmented__btn ${filter === value ? "segmented__btn--active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "Alle" : categoryLabel(value)}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="team-video-empty mt-4"><strong>Videos werden geladen …</strong></div> : null}
        {!loading && filteredVideos.length === 0 ? (
          <div className="team-video-empty mt-4">
            <span className="team-video-empty__icon" aria-hidden>▶</span>
            <strong>Noch keine {filter === "all" ? "Team-Videos" : `${categoryLabel(filter)}-Videos`}</strong>
            <span>Der erste hochgeladene Clip erscheint hier für das gesamte Team.</span>
          </div>
        ) : null}
        {filteredVideos.length > 0 ? (
          <div className="team-video-grid mt-4">
            {filteredVideos.map((video) => (
              <article key={video.id} className="team-video-card">
                <div className="team-video-card__media">
                  {video.signedUrl ? (
                    <video controls preload="metadata" playsInline src={video.signedUrl} aria-label={`${video.title} abspielen`}>
                      Dein Browser unterstützt die Video-Wiedergabe nicht.
                    </video>
                  ) : (
                    <div className="team-video-card__unavailable">Video-Link konnte nicht geladen werden.</div>
                  )}
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
                    <span>Von {video.uploaderName}</span>
                    <span>{new Date(video.createdAt).toLocaleDateString("de-DE")}</span>
                    {formatDuration(video.durationSeconds) ? <span>{formatDuration(video.durationSeconds)}</span> : null}
                    <span>{formatTeamVideoBytes(video.fileSize)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
