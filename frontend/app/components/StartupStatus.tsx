"use client";


export default function StartupStatus({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="startup-status-screen">
      <section>
        <div className="startup-status-logo">
          ✦
        </div>

        <span>GrowthOS AI</span>

        <h1>
          {failed
            ? "GrowthOS could not connect"
            : "Connecting to GrowthOS…"}
        </h1>

        <p>
          {failed
            ? "Make sure the FastAPI backend is running on port 8000, then retry."
            : "Restoring your workspace and connecting to the intelligence engine."}
        </p>

        {!failed ? (
          <>
            <div className="startup-status-progress">
              <i />
            </div>

            <div className="startup-status-steps">
              <div>
                <b>✓</b>
                <span>Restore interface</span>
              </div>
              <div>
                <b className="waiting">•</b>
                <span>Connect backend</span>
              </div>
              <div>
                <b className="waiting">•</b>
                <span>Load workspaces</span>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onRetry}
          >
            Retry connection
          </button>
        )}
      </section>
    </main>
  );
}
