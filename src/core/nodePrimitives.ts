export type NodeTypeId = string;

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type NodeData = JsonObject;

export type CanvasNode<TData extends NodeData = NodeData> = {
  id: string;
  type: NodeTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  data: TData;
};

export type CanvasEditSource = 'pointer' | 'keyboard' | 'nonvisual' | 'ai';

export type WorldPoint = {
  x: number;
  y: number;
};
