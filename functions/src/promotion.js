export const PROMOTION_CODE = 'hosting-maintenance-60-free-2026';
export const PROMOTION_VALID_UNTIL = '2026-12-31';
export const PROMOTION_DURATION_DAYS = 60;
export const PROMOTION_EXCLUDED_PROJECT_IDS = new Set(['7B7AFHl0paBuYglLdxDM']);

export function promotionEndDate(startDate) {
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + PROMOTION_DURATION_DAYS);
    return date.toISOString().slice(0, 10);
}

export function promotionIsEligible(project, projectId = '') {
    return project?.promotionCode === PROMOTION_CODE && !PROMOTION_EXCLUDED_PROJECT_IDS.has(projectId);
}

export function applyPromotionLifecycle(project, projectId = '', today = localDate()) {
    if (!promotionIsEligible(project, projectId)) return project;
    const next = { ...project };
    if (next.projectStatus === 'published' && !next.promotionStartDate) next.promotionStartDate = today;
    if (next.promotionStartDate && !next.promotionEndDate) next.promotionEndDate = promotionEndDate(next.promotionStartDate);
    if (next.promotionStartDate && next.promotionEndDate) {
        if (today > next.promotionEndDate) next.promotionStatus = 'expired';
        else if (today >= next.promotionStartDate && (!next.promotionStatus || next.promotionStatus === 'eligible')) next.promotionStatus = 'active';
        else if (!next.promotionStatus) next.promotionStatus = 'eligible';
    }
    return next;
}

function localDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
