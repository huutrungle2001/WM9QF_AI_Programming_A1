import type { Role, UserType } from "./enums";

export interface ActorContext {
  role: Role;
  user_id?: string | null;
  user_type?: UserType | null;
  department_id?: string | null;
  has_accessibility_access?: boolean;
}

export interface DemoActorPreset extends ActorContext {
  id: string;
  label: string;
  full_name: string;
  subtitle: string;
  course?: string | null;
}
