import styles from "./brand-logo.module.css";

/** All visible marks use the approved raster; no font substitution or extra symbol. */
export function BrandLogo() {
  return <span className={styles.mark} role="img" aria-label="elifora" data-brand-logo>
    {/* Local native-resolution assets retain the approved lettering and fine bristles. */}
    {/* eslint-disable @next/next/no-img-element */}
    <img className={styles.complete} src="/brand/approved/elifora-wordmark.png" alt="" width="1370" height="467" />
    <span className={styles.layers} aria-hidden="true">
      <img data-intro-letters className={styles.letters} src="/brand/approved/elifora-letters.png" alt="" width="1370" height="467" />
      <img data-intro-brush className={styles.brush} src="/brand/approved/elifora-brush.png" alt="" width="323" height="74" />
    </span>
    {/* eslint-enable @next/next/no-img-element */}
  </span>;
}
