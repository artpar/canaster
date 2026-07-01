import { asString } from '../core/nodeData';
import type { JsonObject } from './types';

export type ContactNodeData = {
  name: string;
  role: string;
  organization: string;
  phone: string;
  email: string;
  note: string;
} & JsonObject;

export function normalizeContactNodeData(raw: JsonObject): ContactNodeData {
  return {
    name: asString(raw.name, 'Contact'),
    role: asString(raw.role, ''),
    organization: asString(raw.organization, ''),
    phone: asString(raw.phone, ''),
    email: asString(raw.email, ''),
    note: asString(raw.note, ''),
  };
}
