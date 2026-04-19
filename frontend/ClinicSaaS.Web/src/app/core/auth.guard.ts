import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, UserRole } from './auth.service';

export function roleGuard(allowed: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      router.navigate(['/login']);
      return false;
    }

    const role = auth.getRole();
    if (!role || !allowed.includes(role)) {
      router.navigate(['/login']);
      return false;
    }

    return true;
  };
}

