import { Shape, TEXT_PADDING, getWrappedLines } from '../../../../utils/geometry';

export const getTextSize = (shape: Shape) => {
    const fontSize = shape.fontSize || 16;
    const lineHeight = shape.lineHeight || fontSize * 1.2;
    const rawText = shape.textContent || '';
    const containerWidth = shape.width ? Math.max(shape.width - TEXT_PADDING * 2, 1) : undefined;
    const lines = containerWidth
        ? getWrappedLines(rawText, containerWidth, fontSize)
        : rawText.split('\n');

    const estimatedWidth = containerWidth ?? Math.max(
        fontSize * 0.6,
        ...lines.map(line => (line.length || 1) * fontSize * 0.6)
    );
    const estimatedHeight = Math.max(lineHeight, lines.length * lineHeight);
    const totalWidth = (shape.width ?? (estimatedWidth + TEXT_PADDING * 2));
    const totalHeight = Math.max(shape.height ?? 0, estimatedHeight + TEXT_PADDING * 2);
    return { width: totalWidth, height: totalHeight };
};
