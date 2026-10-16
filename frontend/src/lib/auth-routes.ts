export function isPublicAuthRoute(pathname: string): boolean {
  return ['/admin/login', '/admin/forgot-password', '/admin/reset-password'].includes(pathname.replace(/\/$/, ''));
}
