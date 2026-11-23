/* eslint-disable @next/next/no-html-link-for-pages -- Legacy links check availability on every request. */
import styles from './portal.module.css';

export function LegacyReleaseBanner() {
  return (
    <div className={styles.releaseBanner} role="group" aria-label="旧版发布提示">
      <div className={styles.releaseTrack}>
        <a href="/legacy/about#legacy-edition" className={styles.releaseMessage}>
          <span aria-hidden="true">★</span>旧版门户上线<span aria-hidden="true">★</span>
        </a>
      </div>
    </div>
  );
}
