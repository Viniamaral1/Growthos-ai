"use client";

type Props = {
  value: number;
  label?: string;
  size?: number;
  onClick?: () => void;
  title?: string;
};

export default function ConfidenceRing({ value, label = "Confidence", size = 54, onClick, title }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const content = (
    <>
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <circle className="confidence-ring-track" cx="24" cy="24" r={radius} fill="none" strokeWidth="4" />
        <circle
          className="confidence-ring-progress"
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="confidence-ring-value">{clamped}%</span>
      {label ? <small>{label}</small> : null}
    </>
  );

  if (onClick) {
    return <button type="button" className="confidence-ring" onClick={onClick} title={title ?? `Why ${clamped}% confidence?`}>{content}</button>;
  }
  return <div className="confidence-ring" title={title ?? `${clamped}% confidence`}>{content}</div>;
}
