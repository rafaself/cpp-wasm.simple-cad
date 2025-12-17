/**
 * Sanitizes MTEXT content by handling control codes and formatting tags.
 *
 * Common MTEXT Codes:
 * \P - New paragraph (newline)
 * \L, \l - Start/End Underline (strip)
 * \O, \o - Start/End Overline (strip)
 * \K, \k - Start/End Strike (strip)
 * \H...; - Text height (strip)
 * \W...; - Width factor (strip)
 * \Q...; - Obliquing angle (strip)
 * \C...; - Color (strip)
 * \T...; - Tracking (strip)
 * \f...; - Font (strip)
 * \A...; - Alignment (strip)
 * \S...^...; - Stacking (convert to "num/den")
 * {} - Braces for grouping (strip)
 */
export const sanitizeMTextContent = (text: string): string => {
    if (!text) return '';

    let s = text;

    // 1. Handle Newlines (\P)
    s = s.replace(/\\P/gi, '\n');

    // 2. Handle Stacking \S...^...; (Simple conversion to /)
    // Matches \S numerator ^ denominator ;
    s = s.replace(/\\S(.*?)\^(.*?);/gi, '$1/$2');
    s = s.replace(/\\S(.*?)\#(.*?);/gi, '$1/$2'); // Stack with line
    s = s.replace(/\\S(.*?)\s(.*?);/gi, '$1/$2'); // Stack without line

    // 3. Strip formatting tags with arguments (\H10;, \C5;, etc.)
    // Matches Backslash + One Character + anything until semicolon
    // We strictly look for known formatters to avoid false positives?
    // Or just generic \[A-Z0-9]+.*?;
    // AutoCAD formatting tags are usually uppercase letters.
    s = s.replace(/\\[ACFHQTWf].*?;/g, '');

    // 4. Strip simple toggles (\L, \O, \K, etc.)
    s = s.replace(/\\[LloOkK]/g, '');

    // 5. Remove grouping braces
    s = s.replace(/[{}]/g, '');

    // 6. Remove any remaining backslashes that might be escapes?
    // But keep literal backslashes if needed. MTEXT uses \\ for \.
    s = s.replace(/\\\\/g, '\\');

    return s.trim();
};

export const getDxfTextAlignment = (halign: number, valign: number) => {
    // DXF 72 (Horizontal): 0=Left, 1=Center, 2=Right, 3=Aligned, 4=Middle, 5=Fit
    // DXF 73 (Vertical): 0=Baseline, 1=Bottom, 2=Middle, 3=Top

    // Map to Canvas textAlign
    let align: 'left' | 'center' | 'right' = 'left';

    if (halign === 1 || halign === 4) align = 'center'; // Center or Middle(Horiz)
    if (halign === 2) align = 'right';
    if (halign === 3 || halign === 5) align = 'center'; // Fit/Align - approximate as center or left? Center is safer for placement usually.

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
        case 2: return -height / 2;
        case 3: return -height;
        default: return 0;
    }
};
