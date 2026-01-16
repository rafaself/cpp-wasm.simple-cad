import { Shape, ToolType } from '../../../types';

export const CONDUIT_TOOLS: ToolType[] = [];

export const isConduitTool = (_tool: ToolType) => false;

export const isConduitShape = (_shape?: Shape | null) => false;
