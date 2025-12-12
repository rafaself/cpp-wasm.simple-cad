import { getTextDimensions } from '../../../../utils/geometry';
import { Shape } from '../../../../types';

export const getTextSize = (shape: Shape) => getTextDimensions(shape);
