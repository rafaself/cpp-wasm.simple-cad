import { Shape, ToolType } from '../../../types';

export const CONDUIT_TOOLS: ToolType[] = ['eletroduto'];

export const isConduitTool = (tool: ToolType) => CONDUIT_TOOLS.includes(tool);

export const isConduitShape = (shape?: Shape | null) =>
  !!shape && shape.type === 'eletroduto';
