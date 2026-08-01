"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { defaultProfile, readProfile, writeProfile, type GrowthOSProfile } from "@/lib/profile";

type Props = {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onProfileSaved: (profile: GrowthOSProfile) => void;
  onSuccess: (message: string) => void;
};

export default function SettingsPanel({ theme, onThemeChange, onProfileSaved, onSuccess }: Props) {
  const [profile, setProfile] = useState<GrowthOSProfile>(defaultProfile);

  useEffect(() => setProfile(readProfile()), []);

  function patch<K extends keyof GrowthOSProfile>(key: K, value: GrowthOSProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => patch("avatarDataUrl", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function save() {
    const cleaned = { ...profile, name: profile.name.trim() || "Founder" };
    writeProfile(cleaned);
    document.documentElement.dataset.accent = cleaned.accent;
    onProfileSaved(cleaned);
    onSuccess("Settings saved. Your dashboard greeting has been updated.");
  }

  return (
    <section className="settings-page">
      <header className="settings-hero">
        <div>
          <span>Personal workspace</span>
          <h1>Settings</h1>
          <p>Control your profile, appearance, AI preferences, and notifications.</p>
        </div>
        <button type="button" onClick={save}>Save changes</button>
      </header>

      <div className="settings-grid">
        <article className="settings-card profile-settings-card">
          <header><span>◎</span><div><strong>Profile</strong><small>Used for greetings and future email actions</small></div></header>
          <div className="profile-avatar-row">
            <div className="profile-avatar-preview">
              {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="Profile" /> : profile.name.slice(0, 2).toUpperCase()}
            </div>
            <label className="secondary-setting-button">Choose photo<input type="file" accept="image/*" hidden onChange={chooseAvatar} /></label>
            {profile.avatarDataUrl && <button type="button" className="secondary-setting-button" onClick={() => patch("avatarDataUrl", "")}>Remove</button>}
          </div>
          <div className="settings-fields two-column">
            <label>Name<input value={profile.name} onChange={(e) => patch("name", e.target.value)} /></label>
            <label>Company<input value={profile.company} onChange={(e) => patch("company", e.target.value)} /></label>
            <label>Email<input type="email" value={profile.email} onChange={(e) => patch("email", e.target.value)} /></label>
            <label>Phone<input value={profile.phone} onChange={(e) => patch("phone", e.target.value)} /></label>
          </div>
        </article>

        <article className="settings-card">
          <header><span>◐</span><div><strong>Appearance</strong><small>Choose a comfortable visual style</small></div></header>
          <div className="theme-choice-row">
            <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => onThemeChange("dark")}>Dark</button>
            <button type="button" className={theme === "light" ? "active" : ""} onClick={() => onThemeChange("light")}>Light</button>
          </div>
          <div className="accent-choice-row" aria-label="Accent colour">
            {(["cyan", "blue", "violet", "amber", "neutral"] as const).map((accent) => (
              <button key={accent} type="button" className={`accent-swatch ${accent} ${profile.accent === accent ? "active" : ""}`} onClick={() => patch("accent", accent)} aria-label={`${accent} accent`} />
            ))}
          </div>
        </article>

        <article className="settings-card">
          <header><span>✦</span><div><strong>AI preferences</strong><small>Set the default communication style</small></div></header>
          <label className="settings-select-label">Answer detail<select value={profile.answerStyle} onChange={(e) => patch("answerStyle", e.target.value as GrowthOSProfile["answerStyle"])}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
          <label className="settings-toggle"><input type="checkbox" checked={profile.notifications} onChange={(e) => patch("notifications", e.target.checked)} /><span><strong>Browser notifications</strong><small>Prepare for research and automation alerts later.</small></span></label>
        </article>

        <article className="settings-card">
          <header><span>⌁</span><div><strong>Connected services</strong><small>Architecture prepared for future actions</small></div></header>
          <div className="settings-coming-list"><span>Email <b>Not connected</b></span><span>Calendar <b>Not connected</b></span><span>Voice commands <b>Planned</b></span></div>
        </article>
      </div>
    </section>
  );
}
