export type GrowthOSProfile = {
  name: string;
  email: string;
  phone: string;
  company: string;
  avatarDataUrl: string;
  accent: "cyan" | "blue" | "violet" | "amber" | "neutral";
  answerStyle: "concise" | "balanced" | "detailed";
  notifications: boolean;
};

export const defaultProfile: GrowthOSProfile = {
  name: "Vini",
  email: "",
  phone: "",
  company: "",
  avatarDataUrl: "",
  accent: "cyan",
  answerStyle: "balanced",
  notifications: true,
};

const PROFILE_KEY = "growthos.profile";

export function readProfile(): GrowthOSProfile {
  if (typeof window === "undefined") return defaultProfile;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile;
    return { ...defaultProfile, ...JSON.parse(raw) } as GrowthOSProfile;
  } catch {
    return defaultProfile;
  }
}

export function writeProfile(profile: GrowthOSProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
