import { initializeApp } from 'firebase-admin/app';

import { submitWebsiteRequest as submitWebsiteRequestHandler } from './src/submit-website-request.js';
import { deleteWebsiteRequest, getWebsiteRequests, updateWebsiteRequestStatus } from './src/admin-website-requests.js';
import { addProjectUpdate, createProject, deleteProject, getProject, getProjectUpdates, getProjects, registerMaintenanceActivity, updateProject } from './src/projects.js';
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent } from './src/calendar.js';
import { createProspect, deleteProspect, getProspects, seedProspects, updateProspect } from './src/prospects.js';
import { getHostingHistory, getHostingMonitor, getHostingMonitors, runHostingCheck, scheduledHostingChecks, updateHostingMonitor } from './src/hosting.js';

initializeApp();

export const submitWebsiteRequest = submitWebsiteRequestHandler;
export { deleteWebsiteRequest, getWebsiteRequests, updateWebsiteRequestStatus };
export { addProjectUpdate, createProject, deleteProject, getProject, getProjectUpdates, getProjects, registerMaintenanceActivity, updateProject };
export { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent };
export { createProspect, deleteProspect, getProspects, seedProspects, updateProspect };
export { getHostingHistory, getHostingMonitor, getHostingMonitors, runHostingCheck, scheduledHostingChecks, updateHostingMonitor };
