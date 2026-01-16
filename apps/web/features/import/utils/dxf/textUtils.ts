/**
 * MTEXT Formatting Result
 */
export interface ParsedMText {
  text: string;
  widthFactor?: number; // From \W...;
  oblique?: number; // From \Q...;
}

/**
 * Parses MTEXT content, extracting key formatting overrides (\W, \Q)
 * and sanitizing the rest for display.
 */
export const parseMTextContent = (rawText: string): ParsedMText => {
  if (!rawText) return { text: '' };

  let s = rawText;
  let widthFactor: number | undefined;
  let oblique: number | undefined;

  // 0. Extract Overrides (First occurrence only for simplicity, applied to whole block)
  // Looking for \W1.2; or \Q30;

  // Width Factor
  const wMatch = s.match(/\\W([\d.]+);/i);
  if (wMatch && wMatch[1]) {
    const val = parseFloat(wMatch[1]);
    if (!isNaN(val) && val > 0) {
      widthFactor = val;
    }
  }

  // Oblique Angle
  const qMatch = s.match(/\\Q([\d.-]+);/i);
  if (qMatch && qMatch[1]) {
    const val = parseFloat(qMatch[1]);
    if (!isNaN(val)) {
      oblique = val;
    }
  }

  // 1. Handle Newlines (\P)
  s = s.replace(/\\P/gi, '\n');

  // 2. Handle Stacking \S...^...; (Simple conversion to /)
  s = s.replace(/\\S(.*?)\^(.*?);/gi, '$1/$2');
  s = s.replace(/\\S(.*?)\#(.*?);/gi, '$1/$2');
  s = s.replace(/\\S(.*?)\s(.*?);/gi, '$1/$2');

  // 3. Strip formatting tags with arguments (\H..., \C..., \W..., \Q..., etc.)
  // We already extracted W/Q, so we strip them now.
  s = s.replace(/\\[ACFHQTWf].*?;/g, '');

  // 4. Strip simple toggles (\L, \O, \K, etc.)
  s = s.replace(/\\[LloOkK]/g, '');

  // 5. Remove grouping braces
  s = s.replace(/[{}]/g, '');

  // 6. Remove any remaining backslashes that might be escapes (keep \\ as \)
  s = s.replace(/\\\\/g, '\\');

  return {
    text: s.trim(),
    widthFactor,
    oblique,
  };
};

/**
 * Compatibility wrapper (prefer `parseMTextContent` for logic).
 */
export const sanitizeMTextContent = (text: string): string => {
  return parseMTextContent(text).text;
};

export const getDxfTextAlignment = (halign: number, _valign: number) => {
  // DXF 72 (Horizontal): 0=Left, 1=Center, 2=Right, 3=Aligned, 4=Middle, 5=Fit
  // DXF 73 (Vertical): 0=Baseline, 1=Bottom, 2=Middle, 3=Top

  // Map to Canvas textAlign
  let align: 'left' | 'center' | 'right' = 'left';

  if (halign === 1 || halign === 4) align = 'center'; // Center or Middle(Horiz)
  if (halign === 2) align = 'right';
  if (halign === 3 || halign === 5) align = 'center'; // Fit/Align

  return align;
};

export const getDxfTextShift = (valign: number, height: number): number => {
  // Returns Y-shift in LOCAL text space to simulate vertical alignment.
  // Assuming Y-up coordinate system (scaleY < 0).
  // Text is rendered at (0,0) baseline.

  // valign 0 = Baseline. Shift = 0.
  // valign 1 = Bottom. Shift = 0 (Approx, or descent).
  // valign 2 = Middle. Shift = -height / 2.
  // valign 3 = Top. Shift = -height.

  switch (valign) {
    case 2:
      return -height / 2;
    case 3:
      return -height;
    default:
      return 0;
  }
};
