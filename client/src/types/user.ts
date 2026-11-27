import type { Role, UserType } from "./enums";

export interface UserCreate {
  user_id: string;
  full_name: string;
  email: string;
  user_type: UserType;
  role?: Role;
  course?: string | null;
  department_id: string;
  has_accessibility_access?: boolean;
  is_active?: boolean;
}

export interface UserUpdate {
  full_name?: string | null;
  email?: string | null;
  user_type?: UserType | null;
  role?: Role | null;
  course?: string | null;
  department_id?: string | null;
  has_accessibility_access?: boolean | null;
  is_active?: boolean | null;
}

export interface UserOut {
  user_id: string;
  full_name: string;
  email: string;
  user_type: UserType;
  role: Role;
  course?: string | null;
  department_id: string;
  has_accessibility_access: boolean;
  is_active: boolean;
}
