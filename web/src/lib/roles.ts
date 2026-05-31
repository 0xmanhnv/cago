// Plain (non-client) module so server components can import the values safely.
export const OWNER_ROLES = ["Cago Owner", "System Manager"];
export const STAFF_ROLES = ["Cago Staff", ...OWNER_ROLES];
export const ROLE_SETS = { owner: OWNER_ROLES, staff: STAFF_ROLES };
