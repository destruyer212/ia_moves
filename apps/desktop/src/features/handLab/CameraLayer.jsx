import "./handLabStyles.css";

export function CameraLayer({ videoRef, cameraOn, scanline = true, children }) {
  return (
    <div className="handlab-camera-layer">
      <video
        ref={videoRef}
        className={`handlab-video ${cameraOn ? "handlab-video--live" : "handlab-video--off"}`}
        playsInline
        muted
        aria-hidden={!cameraOn}
      />
      <div className="handlab-camera-vignette" aria-hidden="true" />
      <div className="handlab-camera-glass" aria-hidden="true" />
      {scanline ? <div className="handlab-scanlines" aria-hidden="true" /> : null}
      <div className="handlab-camera-noise" aria-hidden="true" />
      {children}
    </div>
  );
}
