"use client";

import {
  useEffect,
  useRef,
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
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dismissTimer = window.setTimeout(
      () => onCloseRef.current(),
      kind === "error" ? 7000 : 4500,
    );

    return () => {
      window.clearTimeout(dismissTimer);
    };
  }, [kind, message]);

  return (
    <aside
      className={[
        "growthos-toast",
        `growthos-toast-${kind}`,
        "visible",
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
        onClick={() => onCloseRef.current()}
        aria-label="Dismiss notification"
      >
        ×
      </button>

      <i />
    </aside>
  );
}
