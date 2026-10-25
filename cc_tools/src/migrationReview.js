export const MIGRATION_REVIEW_MESSAGE = 'Datos migrados. Revisa el perfil, las programaciones y las entregas antes de pulsar Reanudar automatizaciones.';

export function requireMigrationReview(config, source, date = new Date().toISOString()) {
  config.migrationReview = { required: true, source, importedAt: date };
  config.automationHealth = { ...(config.automationHealth || {}), state: 'paused',
    reasonCode: 'MIGRATION_REVIEW', reason: MIGRATION_REVIEW_MESSAGE,
    pausedAt: date, pausedUntil: '', pauseSource: 'migration' };
  return config;
}

export function assertMigrationReviewed(config) {
  if (config.migrationReview?.required) {
    const error = new Error(MIGRATION_REVIEW_MESSAGE);
    error.code = 'MIGRATION_REVIEW_REQUIRED';
    throw error;
  }
}

export function acknowledgeMigrationReview(config) {
  if (config.migrationReview?.required) {
    config.migrationReview.required = false;
    config.migrationReview.reviewedAt = new Date().toISOString();
  }
}
