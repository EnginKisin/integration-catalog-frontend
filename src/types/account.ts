export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN'
export type Permission = 'VIEW_CREDENTIALS' | 'MANAGE_CREDENTIALS'
export interface Profile {
  username: string
  email: string | null
  emailVerified: boolean
  active: boolean
  authorities: string[]
  permissions: Permission[]
}
export interface UserAccount {
  id: number
  username: string
  email: string | null
  emailVerified: boolean
  active: boolean
  passwordResetRequired: boolean
  role: Role
  permissions: Permission[]
}
export interface UserPage {
  items: UserAccount[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
