import type { CSSProperties } from "react";
import type { DisplayDirection } from "./visual-direction";

/** Original CSS strand illustration; never an official swatch or salon outcome image. */
export function HairSwatch({ direction, large = false }: { direction: DisplayDirection; large?: boolean }) {
 const style = direction.kind === "ILLUSTRATIVE" ? { "--strand-shadow": direction.shadow, "--strand-body": direction.body, "--strand-light": direction.light } as CSSProperties : undefined;
 return <span className={`cl-hair-swatch${large ? " cl-hair-large" : ""}`} data-visual={direction.kind} style={style} aria-hidden="true"><span /><i /></span>;
}
