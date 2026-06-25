import { Component, type ComponentChildren } from "preact";

type Props = {
  children: ComponentChildren;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidCatch(error: Error) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <h2 className="card-title text-error">Algo deu errado</h2>
            <p className="text-base-content/70">
              Ocorreu um erro inesperado ao exibir esta página.
            </p>
            <div className="card-actions mt-4 justify-center">
              <a href="/" className="btn btn-primary">
                Voltar à home
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.location.reload()}
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
