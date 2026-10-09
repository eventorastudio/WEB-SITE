import test from 'node:test';
import assert from 'node:assert/strict';
import { hostingMaintenancePromotion, isPromotionActive, promotionEndDate } from '../shared/promotion.js';
import { applyPromotionLifecycle, promotionIsEligible } from '../functions/src/promotion.js';

test('la promoción tiene configuración pública estable', () => {
  assert.equal(hostingMaintenancePromotion.id, 'hosting-maintenance-60-free-2026');
  assert.equal(hostingMaintenancePromotion.durationDays, 60);
  assert.equal(isPromotionActive(new Date('2026-12-31T23:59:59-06:00')), true);
  assert.equal(isPromotionActive(new Date('2027-01-01T00:00:00-06:00')), false);
});

test('calcula exactamente 60 días naturales', () => {
  assert.equal(promotionEndDate('2026-10-08'), '2026-12-07');
  assert.equal(promotionEndDate('2026-12-31'), '2027-03-01');
});

test('activa la promoción al publicar y excluye Yogurt Arte Sanar', () => {
  const project = { projectStatus: 'published', promotionCode: 'hosting-maintenance-60-free-2026', promotionStatus: '' };
  const active = applyPromotionLifecycle(project, 'new-project', '2026-10-08');
  assert.deepEqual({ start: active.promotionStartDate, end: active.promotionEndDate, status: active.promotionStatus }, { start: '2026-10-08', end: '2026-12-07', status: 'active' });
  assert.equal(promotionIsEligible(project, '7B7AFHl0paBuYglLdxDM'), false);
  assert.deepEqual(applyPromotionLifecycle(project, '7B7AFHl0paBuYglLdxDM'), project);
});
