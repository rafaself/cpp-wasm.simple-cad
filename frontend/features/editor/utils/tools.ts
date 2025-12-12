import { Shape, ToolType } from '../../../types';

export const CONDUIT_TOOLS: ToolType[] = ['conduit', 'eletroduto'];

export const isConduitTool = (tool: ToolType) => CONDUIT_TOOLS.includes(tool);

export const isConduitShape = (shape?: Shape | null) =>
  !!shape && CONDUIT_TOOLS.includes(shape.type);
