import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../lib/database.types';

interface RequireRoleProps {
  allow: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * UI-level convenience to hide tabs/actions a role shouldn't see. This is NOT
 * a security boundary by itself — RLS policies are the real enforcement, this
 * just avoids showing controls that would fail server-side anyway.
 */
export default function RequireRole({ allow, children, fallback = null }: RequireRoleProps) {
  const { role } = useAuth();
  if (!role || !allow.includes(role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
