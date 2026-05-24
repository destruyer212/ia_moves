import { Component } from "react";

export class SpatialLabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[SpatialLab]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="spatial-fallback">
          <h2>Vista 3D reiniciada</h2>
          <p>La escena se detuvo para evitar pantalla negra (suele pasar al activar la cámara).</p>
          <pre>{this.state.error?.message}</pre>
          <button
            type="button"
            className="spatial-btn"
            onClick={() => {
              this.props.onRetry?.();
              this.setState({ error: null });
            }}
          >
            Reintentar escena 3D
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
