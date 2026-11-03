"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Camera,
  Check,
  CircleCheck,
  FolderKanban,
  LoaderCircle,
  LogOut,
  Ticket,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ThemeSwitcher } from "@/components/theme";
import type { Profile } from "@/lib/types";

export type ProfileUpdate = {
  name: string;
  color: string;
  avatar_url: string | null;
};
const colors = ["violet", "peach", "mint", "rose", "blue"];

export default function ProfilePage({
  person,
  username,
  summary,
  onSave,
  onSignOut,
}: {
  person: Profile;
  username: string;
  summary: { projects: number; assigned: number; completed: number };
  onSave: (draft: ProfileUpdate) => Promise<Profile>;
  onSignOut: () => Promise<void>;
}) {
  const original = {
    name: person.name,
    color: person.color,
    avatar_url: person.avatar_url || null,
  };
  const [draft, setDraft] = useState<ProfileUpdate>(original);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dirty =
    draft.name.trim() !== original.name ||
    draft.color !== original.color ||
    draft.avatar_url !== original.avatar_url;

  function update(changes: Partial<ProfileUpdate>) {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved(false);
    setError("");
  }
  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaved(false);
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP photo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose a photo smaller than 2 MB.");
      return;
    }
    setReading(true);
    try {
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Could not read this photo. Try another file."));
        reader.readAsDataURL(file);
      });
      // Validate before showing the preview. The API independently validates it on save.
      const image = new Image();
      image.src = photo;
      await image.decode();
      if (image.width * image.height > 25_000_000)
        throw new Error("Choose a photo up to 25 megapixels.");
      update({ avatar_url: photo });
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "EncodingError"
          ? e.message
          : "Could not read this photo. Try another file.",
      );
    } finally {
      setReading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await onSave({ ...draft, name: draft.name.trim() });
      setDraft({
        name: result.name,
        color: result.color,
        avatar_url: result.avatar_url || null,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-page">
      <form onSubmit={save}>
        <fieldset disabled={busy || reading} className="profile-layout">
          <aside className="profile-identity profile-panel">
            <div className="profile-photo">
              <Avatar person={{ ...person, ...draft }} />
              <button
                type="button"
                className="profile-camera"
                aria-label="Change profile picture"
                onClick={() => input.current?.click()}
              >
                {reading ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Camera size={16} />
                )}
              </button>
            </div>
            <h2>{draft.name.trim() || person.name}</h2>
            <span className="profile-handle">@{username}</span>
            <div className="profile-photo-actions">
              <button
                type="button"
                className="button button-white"
                onClick={() => input.current?.click()}
              >
                {draft.avatar_url ? "Change photo" : "Upload photo"}
              </button>
              {draft.avatar_url && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => update({ avatar_url: null })}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={input}
              id="profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload profile picture"
              className="profile-file-input"
              onChange={(e) => void selectPhoto(e)}
            />
            <span className="profile-photo-hint">
              JPG, PNG or WebP · 2 MB max
            </span>
            <dl className="profile-summary">
              <div>
                <dt>
                  <FolderKanban size={15} className="profile-project-icon" />
                  Projects
                </dt>
                <dd>{summary.projects}</dd>
              </div>
              <div>
                <dt>
                  <Ticket size={15} className="profile-assigned-icon" />
                  Assigned issues
                </dt>
                <dd>{summary.assigned}</dd>
              </div>
              <div>
                <dt>
                  <CircleCheck size={15} className="profile-completed-icon" />
                  Completed
                </dt>
                <dd>{summary.completed}</dd>
              </div>
            </dl>
          </aside>
          <section
            className="profile-details profile-panel"
            aria-labelledby="account-details"
          >
            <div className="profile-section-title">
              <span className="profile-section-icon blue">
                <Camera size={17} />
              </span>
              <h2 id="account-details">Account details</h2>
            </div>
            <label htmlFor="profile-name">Display name</label>
            <input
              id="profile-name"
              name="name"
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              autoComplete="nickname"
            />
            <label htmlFor="profile-username">Username</label>
            <input
              id="profile-username"
              value={username}
              readOnly
              aria-readonly="true"
              autoComplete="username"
            />
            <div className="profile-color-field">
              <span id="avatar-color-label">Avatar color</span>
              <div
                className="color-picker"
                role="group"
                aria-labelledby="avatar-color-label"
              >
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`${color} avatar`}
                    aria-pressed={draft.color === color}
                    className={`color-swatch ${color} ${draft.color === color ? "chosen" : ""}`}
                    onClick={() => update({ color })}
                  >
                    {draft.color === color && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="profile-form-footer">
              <div className="profile-feedback" aria-live="polite">
                {error ? (
                  <span role="alert" className="profile-error">
                    {error}
                  </span>
                ) : saved ? (
                  <span className="profile-saved">
                    <Check size={14} />
                    Profile saved
                  </span>
                ) : null}
              </div>
              <div className="profile-save-actions">
                <button
                  type="button"
                  className="button button-white"
                  disabled={!dirty}
                  onClick={() => {
                    setDraft(original);
                    setError("");
                    setSaved(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={!dirty || !draft.name.trim()}
                >
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </section>
        </fieldset>
      </form>
      <section
        className="profile-appearance profile-panel"
        aria-labelledby="appearance-title"
      >
        <h2 id="appearance-title">Appearance</h2>
        <ThemeSwitcher />
      </section>
      <button
        type="button"
        className="text-button profile-sign-out"
        disabled={busy || reading}
        onClick={async () => {
          setBusy(true);
          try {
            await onSignOut();
          } catch {
            setError("Could not sign out. Please try again.");
            setBusy(false);
          }
        }}
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
}
