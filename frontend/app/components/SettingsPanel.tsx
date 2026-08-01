"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { writeProfile, type GrowthOSProfile } from "@/lib/profile";

type Theme = "light" | "dark";

type Props = {
  theme: Theme;
  profile: GrowthOSProfile;
  onPreviewAppearance: (theme: Theme, accent: GrowthOSProfile["accent"]) => void;
  onSave: (profile: GrowthOSProfile, theme: Theme) => void;
  onSuccess: (message: string) => void;
};

const accents: Array<{ id: GrowthOSProfile["accent"]; label: string }> = [
  { id: "cyan", label: "Turquoise" },
  { id: "blue", label: "Blue" },
  { id: "violet", label: "Violet" },
  { id: "amber", label: "Amber" },
  { id: "neutral", label: "Neutral" },
];

export default function SettingsPanel({
  theme,
  profile,
  onPreviewAppearance,
  onSave,
  onSuccess,
}: Props) {
  const [draftProfile, setDraftProfile] = useState(profile);
  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const originalRef = useRef({ profile, theme });
  const savedRef = useRef(false);
  const previewCallbackRef = useRef(onPreviewAppearance);

  useEffect(() => {
    previewCallbackRef.current = onPreviewAppearance;
  }, [onPreviewAppearance]);

  useEffect(() => {
    originalRef.current = { profile, theme };
    setDraftProfile(profile);
    setDraftTheme(theme);
    savedRef.current = false;
  }, [profile, theme]);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        previewCallbackRef.current(
          originalRef.current.theme,
          originalRef.current.profile.accent,
        );
      }
    };
  }, []);

  function patch<K extends keyof GrowthOSProfile>(
    key: K,
    value: GrowthOSProfile[K],
  ) {
    setDraftProfile((current) => ({ ...current, [key]: value }));
  }

  function previewAppearance(
    nextTheme: Theme,
    nextAccent: GrowthOSProfile["accent"],
  ) {
    setDraftTheme(nextTheme);
    setDraftProfile((current) => ({ ...current, accent: nextAccent }));
    onPreviewAppearance(nextTheme, nextAccent);
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => patch("avatarDataUrl", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function save() {
    const cleaned: GrowthOSProfile = {
      ...draftProfile,
      name: draftProfile.name.trim() || "Founder",
      company: draftProfile.company.trim(),
      email: draftProfile.email.trim(),
      phone: draftProfile.phone.trim(),
    };
    writeProfile(cleaned);
    savedRef.current = true;
    originalRef.current = { profile: cleaned, theme: draftTheme };
    onSave(cleaned, draftTheme);
    onSuccess("Settings saved. Your dashboard greeting and appearance were updated.");
  }

  function discardPreview() {
    const original = originalRef.current;
    setDraftProfile(original.profile);
    setDraftTheme(original.theme);
    onPreviewAppearance(original.theme, original.profile.accent);
  }

  return (
    <section className="settings-page settings-page-v2">
      <header className="settings-hero settings-hero-v2">
        <div>
          <span>Personal workspace</span>
          <h1>Settings</h1>
          <p>Preview appearance instantly, then save only when you are happy.</p>
        </div>
        <div className="settings-save-actions">
          <button type="button" className="secondary-setting-button" onClick={discardPreview}>
            Discard preview
          </button>
          <button type="button" onClick={save}>Save changes</button>
        </div>
      </header>

      <div className="settings-grid settings-grid-v2">
        <article className="settings-card profile-settings-card">
          <header>
            <span>◎</span>
            <div><strong>Profile</strong><small>Used for dashboard greetings and future actions</small></div>
          </header>
          <div className="profile-avatar-row">
            <div className="profile-avatar-preview">
              {draftProfile.avatarDataUrl
                ? <img src={draftProfile.avatarDataUrl} alt="Profile" />
                : (draftProfile.name || "Founder").slice(0, 2).toUpperCase()}
            </div>
            <label className="secondary-setting-button">
              Choose photo
              <input type="file" accept="image/*" hidden onChange={chooseAvatar} />
            </label>
            {draftProfile.avatarDataUrl && (
              <button type="button" className="secondary-setting-button" onClick={() => patch("avatarDataUrl", "")}>Remove</button>
            )}
          </div>
          <div className="settings-fields two-column">
            <label>Name<input value={draftProfile.name} onChange={(e) => patch("name", e.target.value)} /></label>
            <label>Company<input value={draftProfile.company} onChange={(e) => patch("company", e.target.value)} /></label>
            <label>Email<input type="email" value={draftProfile.email} onChange={(e) => patch("email", e.target.value)} /></label>
            <label>Phone<input value={draftProfile.phone} onChange={(e) => patch("phone", e.target.value)} /></label>
          </div>
        </article>

        <article className="settings-card appearance-settings-card">
          <header>
            <span>◐</span>
            <div><strong>Interface theme</strong><small>Changes below are a live preview until you save</small></div>
          </header>

          <div className="appearance-preview-controls">
            <label>
              Theme
              <select
                value={draftTheme}
                onChange={(event) => previewAppearance(event.target.value as Theme, draftProfile.accent)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label>
              Accent colour
              <select
                value={draftProfile.accent}
                onChange={(event) => previewAppearance(draftTheme, event.target.value as GrowthOSProfile["accent"])}
              >
                {accents.map((accent) => <option key={accent.id} value={accent.id}>{accent.label}</option>)}
              </select>
            </label>
          </div>

          <div className="accent-choice-row accent-choice-preview" aria-label="Accent colour preview">
            {accents.map((accent) => (
              <button
                key={accent.id}
                type="button"
                className={`accent-swatch ${accent.id} ${draftProfile.accent === accent.id ? "active" : ""}`}
                onClick={() => previewAppearance(draftTheme, accent.id)}
                aria-label={`Preview ${accent.label} accent`}
                title={accent.label}
              />
            ))}
            <span>Live website preview</span>
          </div>

          <div className="settings-live-preview" aria-label="Appearance preview">
            <div className="settings-live-preview-nav"><i /><i /><i /></div>
            <div className="settings-live-preview-body">
              <span />
              <strong>GrowthOS preview</strong>
              <p>Cards, buttons, borders, and highlights update before you save.</p>
              <button type="button">Preview action</button>
            </div>
          </div>
        </article>

        <article className="settings-card">
          <header><span>✦</span><div><strong>AI preferences</strong><small>Choose the default communication style</small></div></header>
          <label className="settings-select-label">
            Answer detail
            <select value={draftProfile.answerStyle} onChange={(e) => patch("answerStyle", e.target.value as GrowthOSProfile["answerStyle"])}>
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={draftProfile.notifications} onChange={(e) => patch("notifications", e.target.checked)} />
            <span><strong>Browser notifications</strong><small>For research completion and future workflow alerts.</small></span>
          </label>
        </article>

        <article className="settings-card">
          <header><span>⌁</span><div><strong>Connected services</strong><small>Safe foundations for future actions</small></div></header>
          <div className="settings-coming-list">
            <span>Email <b>Not connected</b></span>
            <span>Calendar <b>Not connected</b></span>
            <span>Voice commands <b>Planned</b></span>
            <span>Knowledge summaries <b>Planned</b></span>
          </div>
        </article>
      </div>
    </section>
  );
}
