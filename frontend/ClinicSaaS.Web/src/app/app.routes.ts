import { Routes } from '@angular/router';
import { roleGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/marketing/marketing-home.component').then((m) => m.MarketingHomeComponent),
  },
  {
    path: 'features',
    loadComponent: () => import('./pages/public/public-features.component').then((m) => m.PublicFeaturesComponent),
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pages/public/public-pricing.component').then((m) => m.PublicPricingComponent),
  },
  {
    path: 'demo',
    loadComponent: () => import('./pages/public/public-demo.component').then((m) => m.PublicDemoComponent),
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/public/public-contact.component').then((m) => m.PublicContactComponent),
  },
  { path: 'marketing', redirectTo: '', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'platform/overview',
    loadComponent: () => import('./pages/platform/platform-overview.component').then((m) => m.PlatformOverviewComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/clinics',
    loadComponent: () =>
      import('./pages/platform-admin/admin-clinics.component').then((m) => m.AdminClinicsComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/subscriptions',
    loadComponent: () => import('./pages/platform/platform-subscriptions.component').then((m) => m.PlatformSubscriptionsComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/billing',
    loadComponent: () => import('./pages/platform/platform-billing.component').then((m) => m.PlatformBillingComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/audit',
    loadComponent: () => import('./pages/platform/platform-audit.component').then((m) => m.PlatformAuditComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/health',
    loadComponent: () => import('./pages/platform/platform-health.component').then((m) => m.PlatformHealthComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/support',
    loadComponent: () => import('./pages/platform/platform-support.component').then((m) => m.PlatformSupportComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'platform/onboarding',
    loadComponent: () => import('./pages/platform/platform-onboarding.component').then((m) => m.PlatformOnboardingComponent),
    canActivate: [roleGuard(['PlatformAdmin'])],
  },
  {
    path: 'admin/clinics',
    redirectTo: 'platform/clinics',
    pathMatch: 'full',
  },
  {
    path: 'clinic/reception',
    loadComponent: () =>
      import('./pages/reception/reception-dashboard.component').then((m) => m.ReceptionDashboardComponent),
    canActivate: [roleGuard(['Receptionist', 'PlatformAdmin'])],
  },
  { path: 'reception', redirectTo: 'clinic/reception', pathMatch: 'full' },
  {
    path: 'clinic/analytics',
    loadComponent: () => import('./pages/clinic/clinic-analytics.component').then((m) => m.ClinicAnalyticsComponent),
    canActivate: [roleGuard(['Receptionist', 'Doctor'])],
  },
  {
    path: 'clinic/communications',
    loadComponent: () => import('./pages/communications/communications-home.component').then((m) => m.CommunicationsHomeComponent),
    canActivate: [roleGuard(['Receptionist', 'Doctor'])],
  },
  {
    path: 'clinic/communications/conversations',
    loadComponent: () =>
      import('./pages/communications/communications-conversations.component').then((m) => m.CommunicationsConversationsComponent),
    canActivate: [roleGuard(['Receptionist', 'Doctor'])],
  },
  {
    path: 'clinic/communications/campaigns',
    loadComponent: () => import('./pages/communications/communications-campaigns.component').then((m) => m.CommunicationsCampaignsComponent),
    canActivate: [roleGuard(['Receptionist', 'Doctor'])],
  },
  {
    path: 'clinic/communications/templates',
    loadComponent: () => import('./pages/communications/communications-templates.component').then((m) => m.CommunicationsTemplatesComponent),
    canActivate: [roleGuard(['Receptionist', 'Doctor'])],
  },
  {
    path: 'clinic/doctor',
    loadComponent: () => import('./pages/doctor/doctor-dashboard.component').then((m) => m.DoctorDashboardComponent),
    canActivate: [roleGuard(['Doctor'])],
  },
  { path: 'doctor', redirectTo: 'clinic/doctor', pathMatch: 'full' },
  {
    path: 'clinic/doctor/billing',
    loadComponent: () => import('./pages/doctor-billing/doctor-billing.component').then((m) => m.DoctorBillingComponent),
    canActivate: [roleGuard(['Doctor'])],
  },
  { path: 'doctor/billing', redirectTo: 'clinic/doctor/billing', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
