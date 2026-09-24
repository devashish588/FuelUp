// =============================================
// FuelUp - HTTP status mapping for vision errors (server)
// Mirrors the text mapping; AI_IMAGE_UNSUPPORTED is a 503 (capable
// endpoint, incapable setup) so clients show manual-entry guidance.
// =============================================

export function visionStatusFor(code: string): number {
  switch (code) {
    case 'AI_RATE_LIMITED':
      return 429;
    case 'AI_QUOTA':
      return 429;
    case 'AI_TIMEOUT':
      return 504;
    case 'AI_INVALID_OUTPUT':
      return 502;
    case 'AI_REQUEST_TOO_LARGE':
      return 413;
    case 'AI_IMAGE_UNSUPPORTED':
    case 'AI_CONFIGURATION_ERROR':
    case 'AI_UNAVAILABLE':
    default:
      return 503;
  }
}
