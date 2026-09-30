import path from "path";
import { Font } from "@react-pdf/renderer";

let registered = false;

/** 注册 CJK 字体（幂等）。@react-pdf/renderer 默认字体不含中文，需显式注册。 */
export function ensurePdfFont() {
  if (registered) return;
  Font.register({
    family: "Noto Sans SC",
    src: path.join(process.cwd(), "src", "lib", "fonts", "NotoSansSC.ttf"),
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}