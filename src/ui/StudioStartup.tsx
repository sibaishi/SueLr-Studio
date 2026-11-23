import { version } from '../../package.json';
import artwork from './assets/studio-startup.jpg';

/** The real boot overlay and its preview share this minimal artwork layout. */
export function StudioStartup({ done = false, onArtworkReady }: { done?: boolean; onArtworkReady?: () => void }) {
  return (
    <section className="studio-startup" aria-label="SueLr Studio 启动页">
      <img
        className="studio-startup__artwork"
        src={artwork}
        alt=""
        fetchPriority="high"
        onLoad={onArtworkReady}
        onError={onArtworkReady}
      />
      <h1 className="studio-startup__title">SueLr Studio {version}</h1>
      <span className="sr-only" role="status" aria-live="polite">
        {done ? '工作室已就绪' : '正在准备创作空间'}
      </span>
    </section>
  );
}
