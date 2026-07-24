"use client";

import {
  useEffect,
  useState,
} from "react";


export type ToastKind =
  | "success"
  | "error";


export default function Toast({
  kind,
  message,
  onClose,
}: {
  kind: ToastKind;
  message: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);

    const dismissTimer = window.setTimeout(
      onClose,
      kind === "error" ? 7000 : 4500,
    );

    return () => {
      window.clearTimeout(dismissTimer);
    };
  }, [kind, message, onClose]);

  return (
    <aside
      className={[
        "growthos-toast",
        `growthos-toast-${kind}`,
        visible ? "visible" : "",
      ].join(" ")}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <span>
        {kind === "error" ? "!" : "✓"}
      </span>

      <div>
        <strong>
          {kind === "error"
            ? "GrowthOS could not complete the action"
            : "Saved"}
        </strong>
        <p>{message}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        ×
      </button>

      <i />
    </aside>
  );
}
